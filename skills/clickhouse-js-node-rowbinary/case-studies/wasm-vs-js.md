# Case study: why JS, not WASM, for RowBinary parsing (and the one place WASM wins)

**TL;DR** — A JIT-compiled JS RowBinary reader already streams bytes at **memory
bandwidth** (~16 GB/s), and the dominant cost of decoding is allocating the JS
values themselves (objects, `Date`, strings, `BigInt`) — which **WASM cannot do
and therefore cannot remove**. So for the skill's actual job, turning a RowBinary
response into usable JS data, WASM buys ~nothing (a wash, or a loss after the
copy-in tax). WASM wins decisively in exactly **one** different problem:
**in-place aggregation of wide integers / decimals** (and hash group-by), where
JS is forced onto heap `BigInt`/`Map`. There we measured a hand-written WASM
kernel at **27–38x** over JS. But that is _compute_, not parsing — and it is
usually pushable to ClickHouse anyway. And if you genuinely need heavier
**client-side analytics**, the lever isn't WASM-over-RowBinary at all — it's a
**columnar wire format (`Native`)**, coming soon to the JS client out of the
Python-client collaboration; RowBinary is row-major and fights every analytical
pass.

Reproduce:

- `npx vitest bench --run tests/iot.wasm-headroom.bench.ts` (the parsing headroom)
- `node tests/wasm-int128.experiment.mjs` (the hand-emitted WASM kernel)

All numbers Node 24 / V8; yours will vary.

## The idea under test

A tempting architecture: a _dynamic WASM JIT inside the JS runtime_. A type
builder (`t.Int32()`, `t.Map(t.FixedString, t.Int32())`) plus a query DSL
(`q.sum(q.column(1))`) compile **on the fly** to a WASM module that parses the
raw network chunk sitting at address 0 in linear memory, computes the answer,
writes it to a result region, and returns the offset where the incomplete
trailing row begins (streaming resume). Elegant. The question is _what it would
win_ — and the honest answer needs three measurements.

## Proof 1 — JIT-compiled JS reads at memory speed

V8 compiles `DataView` accessors to native loads. Folding a 32 MB column of
native-width values (`Float64`) in a plain JS loop:

| Read                   | ms / 32 MB | throughput    |
| ---------------------- | ---------- | ------------- |
| JS `DataView` f64 fold | 1.94 ms    | **16.5 GB/s** |

That is essentially RAM bandwidth. **There is no headroom for a "faster
language" to read these bytes** — JS is already at the metal. A WASM parser
reading the same bytes lands in the same place (see Proof 3, where the WASM
kernel reads at 28 GB/s doing _integer_ loads — same order, also bandwidth-bound,
not 10x).

## Proof 2 — the parsing bottleneck is allocation, which WASM can't touch

On the best case for RowBinary (IoT, every column fixed-width numeric), three
decoders over the same buffer (`tests/iot.wasm-headroom.bench.ts`):

| Decode                                               | ms   | vs current | what it isolates     |
| ---------------------------------------------------- | ---- | ---------- | -------------------- |
| **rows** — current fast reader (objects + `Date`)    | 3.48 | 1.0x       | full materialization |
| **columnar** — into typed arrays, no per-row objects | 0.86 | 4.0x       | drop the objects     |
| **parseOnly** — reads only, zero allocation          | 0.61 | 5.8x       | the pure-read floor  |

**~83% of decode time is JS-side object/`Date` allocation**, not byte reading.
A WASM parser still has to produce those JS values across the boundary, so it
_cannot_ remove that 83%. Even if WASM made the parse slice instantaneous and the
copy-in free, the row-object decode would drop only `3.48 → 2.88 ms` — a **max
~1.2x**, and realistically a wash once you add the copy into linear memory.

The 4.0x that _is_ on the table comes from the **output contract** (columnar
typed arrays), and it's available in **plain JS** — no WASM. (That columnar path
is worth shipping; it's the real win this whole investigation surfaced.)

## Proof 3 — the one place WASM wins: wide-int / decimal aggregation

Summing an `Int128` column forces JS onto heap `BigInt` (one allocation per
row). A hand-emitted WASM kernel (94 bytes; native `i64` add-with-carry) does it
in registers. Same 32 MB buffer, result verified equal to the BigInt sum
(`tests/wasm-int128.experiment.mjs`):

| Sum of an `Int128` column               | ms / 32 MB | throughput |                |
| --------------------------------------- | ---------- | ---------- | -------------- |
| **JS BigInt-128 sum** (what JS must do) | 42.93 ms   | 0.7 GB/s   | correct        |
| WASM `i64` add-carry — kernel only      | 1.14 ms    | 28.2 GB/s  | correct        |
| WASM + copy-in boundary tax             | 1.62 ms    | 19.7 GB/s  | (copy 0.49 ms) |

**WASM is 37.8x faster than JS (26.5x including the copy into linear memory).**
Note _why_: the win is escaping `BigInt`, not reading bytes faster — the WASM
kernel (28 GB/s) is the same order as the JS f64 floor (16.5 GB/s). JS pays a
**22x `BigInt` tax** purely to add 128-bit integers; WASM's native `i64` reclaims
it. The same logic applies to `Decimal128/256` accumulation and to hash group-by
(WASM open-addressing table in linear memory vs JS `Map` + GC).

## Verdict on the dynamic-WASM-JIT

The architecture is **sound for the aggregation regime and only that regime**.
It targets the one quadrant where WASM beats well-written JS: _parse and compute
in place, return a small result, never cross the boundary per value._ The design
answers its own open questions well:

- **Where does the answer go?** Scalars return directly (`i128` via multi-value
  or two `i64`s); group-by results go to a reserved linear-memory region that JS
  reads as a typed-array view — only the small final result crosses.
- **Streaming.** Returning the resume offset (vs throwing across the FFI) is
  clean, and accumulator state lives in linear memory across chunks — the module
  _is_ the streaming aggregation state.

But three caveats bound where it's worth building:

1. **For parsing → JS values, use generated JS, not WASM.** Proofs 1–2: JS is
   already at memory speed and the cost is materialization WASM can't remove. A
   `DSL → new Function(generatedJS)` backend captures the parse + native-numeric
   aggregation case with **zero toolchain**, debuggable. This is the skill's
   existing monomorphization thesis.
2. **Reserve a WASM backend for the wide-int/decimal + group-by kernels only** —
   gate it on the presence of `Int128/256`, `Decimal128/256`, or a `GROUP BY`,
   where Proof 3's 27–38x is real. For `Float64` sums it would tie JS.
3. **SIMD won't help much** — RowBinary is row-major (AoS); strided columns
   defeat Wasm SIMD (no gather) without a transpose pass. The WASM win here is
   native `i64` + no GC, not vectorization.
4. **The elephant: push it down.** `q.sum(col)` is `SELECT sum(col)` — ClickHouse
   will beat any client. Client-side aggregation only justifies itself when you
   _can't_ push down: folding a stream you already receive for another reason,
   combining across queries/sources, or compute SQL can't express.

## If you need more client-side analytical strength: reach for Native columnar

Step back from WASM and look at _why_ the wins above are so narrow. RowBinary is
**row-major (AoS)**: every row interleaves all columns, so any analytical pass —
fold a column, vectorize, build a column-at-a-time accumulator — has to stride
over the bytes it doesn't want and re-materialize a value at a time. That is the
same row-major tax that defeats SIMD (caveat 3) and that makes the free **4x in
Proof 2 cost a transpose** today (you decode rows, _then_ pack into typed
arrays).

So the honest answer to _"I need real client-side analytical strength"_ is **not
a smarter parser over RowBinary, and not WASM** — it is a **columnar wire
format**. ClickHouse's **`Native`** format is **column-major (SoA)**: each block
arrives as contiguous per-column runs. That flips every constraint in this study:

- The Proof-2 columnar typed-array path stops needing a transpose — the wire
  _is_ already `Float64Array`-shaped, so you `subarray`/`set` a column in one
  move instead of decoding rows first.
- Vectorization becomes real: a contiguous column is exactly what `v128.load` /
  SIMD (and even auto-vectorized JS) want — the gather problem disappears.
- The wide-int/decimal aggregation win (Proof 3) keeps applying, now over
  contiguous input, which is the friendliest possible layout for it.

A columnar reader is **coming to the JS client soon**, out of the **collaboration
with the Python client** (which already ships a mature `Native`/columnar path —
the format and lessons port directly). When it lands, the order of preference for
client-side analytics becomes: **push down to ClickHouse → if you can't, decode
`Native` columnar → reserve WASM for the wide-int/decimal/group-by kernel on top
of those columns.** RowBinary stays the right tool for what this skill targets —
turning a result into JS _rows/values_ — not for analytics over them.

## Takeaways

- **Generated JS is the right engine for the parser.** It reads at memory
  bandwidth; the remaining cost is JS-value materialization that no language
  swap removes. WASM for parsing is a wash-to-loss.
- **The free 4x is a columnar (typed-array) output contract — in pure JS.** Worth
  capturing as a first-class option for numeric results.
- **WASM earns its complexity in one place: in-place wide-int/decimal/group-by
  aggregation** (27–38x measured), where JS is trapped in `BigInt`/`Map`. And
  even then, prefer pushing the aggregation to ClickHouse unless you genuinely
  can't.
- **For real client-side analytical strength, the answer is columnar, not WASM.**
  RowBinary is row-major and taxes every analytical pass; a `Native` (SoA)
  columnar reader — coming to the JS client soon via the Python-client
  collaboration — removes the transpose, unlocks SIMD, and is the natural
  substrate for the aggregation kernels above.
- Matches the rest of the studies' through-line: pick the tool for the shape of
  the work, and **measure** — the 94-byte WASM kernel exists precisely so this
  claim isn't hand-waved.
