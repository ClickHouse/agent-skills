# ClickHouse Node.js RowBinary Codec Generator

**If JS had a -O3 compiler flag, this skill would be it.** (for RowBinary read & write)

A skill and a library that lets a coding agent generate bespoke RowBinary codecs on the first pass from the column type definitions of a ClickHouse response. The [spirit](#the-spirit) behind the approach.

**Reads and writes.** Both directions are covered: readers (decode bytes → values) and writers (encode values → bytes), split under `src/readers/` and `src/writers/`. The reader path is the more mature one — the writers mirror it type-for-type, with a few decode-only paths (`Dynamic`, `JSON`, the runtime header/compile path, and the columnar typed-array path) not yet mirrored.

## Status

- ✅ Sonnet 4.6: 60% -> 94.0% pass rate
- ✅ Opus 4.8: 71% -> 94.7% pass rate
- ✅ Haiku 4.5: 52% -> 86.0% pass rate
- ✅ Composer 2.5 Fast: 3x parser performance
- ✅ 724/724 tests (readers + writers)
- ✅ type-checked
- ✅ benchmarked

## Example

Take a small orders result:

```sql
SELECT id, uid, price, status FROM orders
--  id     UInt8
--  uid    UUID
--  price  Decimal64(2)
--  status Enum8('new' = 1, 'shipped' = 2, 'done' = 3)
```

**The API-only reader** — what you write by composing the library's combinators. Correct, clear, and a fine default:

```ts
const readOrderRow: Reader<OrderRow> = (s) => ({
  id: readUInt8(s),
  uid: formatUUID(readUUID(s)),
  price: readDecimal64(2)(s),
  status: readInt8(s), // raw enum int; `readEnum8(map)` resolves it to the name
});
```

**The optimized reader the skill generates** — same row, monomorphized to
straight-line code. The whole row is fixed-width (1 + 16 + 8 + 1 = 26 bytes), so
the four separate bounds checks coalesce into one `advance(s, 26)` and every leaf
read happens at a constant offset; the per-field combinators are gone:

```ts
const readOrderRowFast: Reader<OrderRow> = (s) => {
  const { buf, view } = s;
  const o = advance(s, 26); // one bounds check for the whole 26-byte row
  const id = buf[o]!;
  const uid = formatUUIDTable(buf.subarray(o + 1, o + 17));
  const price: DecimalValue = [view.getBigInt64(o + 17, true), 2];
  const status = view.getInt8(o + 25);
  return { id, uid, price, status };
};
```

Same values, same streaming-safety — **~3.4x** faster.

## How to use

As a library (comes with the skill):

```bash
npm install @clickhouse/rowbinary
npx skills-npm setup
```

As a skill only:

```bash
npx skills add ClickHouse/clickhouse-js/skills/clickhouse-js-node-rowbinary
```

```console
> Hey, Claude, tell me what the rowbinary skill can do for me.
> A lot! It generates custom, high-performance RowBinary readers and writers…
> Super, generate a reader for the queries in app/src/model.ts.
< Reading skill clickhouse-js-node-rowbinary…
```

## Using it with the ClickHouse JS client

This library only **decodes** the bytes — it doesn't open connections. Pair it
with the official client to fetch a `RowBinary` response and feed the byte chunks
into `streamRowBatches(chunks, readRow)`.

`RowBinary` isn't one of the formats the client decodes itself, so don't use
`client.query({ format: ... })` for it. Instead use `client.exec({ query })` with
the `FORMAT RowBinary` clause written into the SQL yourself — `exec` hands back the
**raw, undecoded byte stream** of the response, which is exactly what this library
consumes. (Use plain `RowBinary`, not `RowBinaryWithNamesAndTypes`, unless your
reader also skips the leading names/types header.)

The row reader below is the `orders` example from [EXAMPLES.md](EXAMPLES.md); swap
in the reader the skill generates for your own columns.

```ts
import {
  type Reader,
  readUInt8,
  readInt8,
  readUUID,
  formatUUID,
  readDecimal64,
  type DecimalValue,
  streamRowBatches,
} from "@clickhouse/rowbinary";
import { createClient } from "@clickhouse/client";

type OrderRow = {
  id: number;
  uid: string;
  price: DecimalValue;
  status: number;
};

const readOrderRow: Reader<OrderRow> = (s) => ({
  id: readUInt8(s),
  uid: formatUUID(readUUID(s)),
  price: readDecimal64(2)(s),
  status: readInt8(s), // raw enum int; `readEnum8(map)` resolves it to the name
});

// `exec` resolves to a Node `Stream.Readable`. It is already an
// `AsyncIterable<Uint8Array>` (chunks are `Buffer`/`Uint8Array`, which
// `streamRowBatches` normalizes), so pass `stream` straight in:

const client = createClient();

const { stream } = await client.exec({
  query: "SELECT id, uid, price, status FROM orders FORMAT RowBinary",
});

for await (const rows of streamRowBatches(stream, readOrderRow)) {
  for (const row of rows) console.log(row); // { id, uid, price: [unscaled, scale], status }
}

await client.close();
```

## Why it's worth it

Four pillars — speed, correctness, judgment, and lifting smaller models:

- **~2–3x faster code than the straightforward decoder.** The skill emits
  monomorphized, flattened, straight-line code — inlined reads, bounds checks
  coalesced across adjacent fixed-width columns, the right array layout — measured
  at ~1.3–3.4x over the _same logic written with the plain combinator API_
  (`npm run bench`). This is why
  - inlined JIT friendly code
  - benchmarked hot paths
  - minimal allocations
  - v8 and Node.js specific optimizations
- **Correct on the gotchas that otherwise quietly break.** UUID byte
  order, `Variant`'s sort-by-type-name discriminant, `DateTime64` sub-second
  precision, signed-high-word wide integers, faithful decimals, `Dynamic`/`JSON`
  self-description, transparent wrappers, opaque `AggregateFunction` — each
  encoded with a live, server-verified test ([details below](#correctness-on-the-gotcha-heavy-types)).
- **Judgment, not just code.** The skill carries the working knowledge to make
  the right call _before_ writing a line, so the agent neither over- nor
  under-engineers:
  - **Is RowBinary even right?** For string-heavy results read as text, a `JSON*`
    format + V8's native `JSON.parse` (plus `gzip`/`zstd`) can beat a JS RowBinary
    decoder — reach for RowBinary when the data is numeric / wide-integer /
    binary-blob heavy.
  - **Whole buffer or stream?** Drop the `advance()` bounds checks for a complete
    in-memory buffer (faster); keep them for a chunked HTTP response that must
    survive rows straddling chunk boundaries.
  - **Drop the portability scaffolding.** RowBinary is little-endian and the
    target is x86/ARM, so the skill steers away from big-endian / byte-swap
    "portability" code a cautious one-shot pass tends to add.
- **Improves smaller models' performance.** Because the skill hands over the
  hard-won answers up front, it lifts a weaker model the most. In a 24-eval
  with-skill vs no-skill benchmark, the skill [raised](eval_result_sonnet.md) **Sonnet 4.6** from 60.4% to
  **94.0%** (+34pp) — bringing it level with skill-equipped **Opus 4.8** (94.7%),
  which itself [gained](eval_result.md) +23pp (71.5% → 94.7%). Composer 2.5 Fast
  [got](eval_result_composer.md) a 3x parser performance boost, Haiku 4.5
  [raised](eval_result_haiku.md) from 52% to 86% — the skill closes
  most of the model-capability gap on this task.

## What it does

Given the columns of a query result — their names and ClickHouse type
definitions (as returned by `RowBinaryWithNamesAndTypes`, or supplied by the
user) — the skill generates parser code tailored to exactly those types. Rather
than shipping a generic, runtime-driven decoder, it emits straight-line code
that reads each column in order, so the parser only contains the logic the
specific result shape needs.

**Schema only known at runtime?** `compileRowBinaryWithNamesAndTypes(cursor)`
reads the `RowBinaryWithNamesAndTypes` header and folds each column type into a
reader on the fly (type strings parsed by `@clickhouse/datatype-parser`),
returning a `readRows` driver for the rest of the stream — a generic, no-codegen
path for dynamic schemas. The specialized codegen above stays the fast path when
the types are fixed.

## Correctness on the gotcha-heavy types

For a plain `UInt64, String, DateTime` result a strong model already writes fast,
correct code on its own. The skill earns its keep on the **long tail of RowBinary
traps** — the encodings where a from-scratch decoder is quietly wrong — each one
captured here with a live, server-verified test:

- **UUID** — two little-endian `UInt64` halves, each byte-reversed vs. the text
  form (not 16 bytes in order).
- **`Variant(...)`** — the 1-byte discriminant indexes the alternatives sorted by
  **type name** (ClickHouse globally sorts them), NOT declaration order; `0xFF`
  is NULL.
- **`DateTime64(P)`** — returned as `[Date, nanoseconds]` so the sub-second part
  isn't lost to a `Date`'s millisecond resolution; `Time`/`Time64` are durations,
  not instants.
- **Wide integers** — `Int128`/`Int256` compose from 64-bit words with the **high
  word read signed**; 64-bit values stay `bigint`, never a lossy `number`.
- **Decimals** — kept as the exact `[unscaled, scale]` pair, not a lossy float.
- **`Dynamic` / `JSON`** — self-describing: a per-value binary type encoding, then
  the value; declared typed `JSON` paths are written without a tag (need the
  schema). Wrappers are erased (`Nullable`/`Variant` → concrete type).
- **Transparent wrappers** — `LowCardinality(T)` / `SimpleAggregateFunction(f, T)`
  decode as the inner `T` (no dictionary layer in RowBinary); `Nested(...)` is
  `Array(Tuple(...))` with no wire of its own.
- **`AggregateFunction(...)`** — opaque, unframed state: not decodable or even
  skippable; finalize server-side instead.
- **`FixedString`** preserves trailing NUL padding; **`Enum`** decodes to the
  underlying int (the name map is metadata); **`BFloat16`** is the top 16 bits of
  a `Float32`.

This is also where a raw model is most likely to go wrong. In a clean-room test
on a `Variant` / `UUID` / `DateTime64` / `LowCardinality` schema, a no-skill
Sonnet produced a **silently wrong UUID** (treated the bytes as plain, missing
the two-reversed-halves layout), and a no-skill Opus got it right only after
**three web searches**. The skill hands over these answers up front — correct by
construction, no lookups. See `baseline/README.md` for the full control.

And the failure isn't a one-off — it's a coin-flip. Running the same no-skill
Sonnet on the `orders` schema (`UInt8, UUID, Decimal64(2), Enum8`) **5 times in
isolation**, only **3 of 5** runs decoded correctly; both failures were the same
UUID byte-order scramble. Even the passing runs varied ~1.9x in generated-code
throughput. With the skill, every run is correct. So a single A/B undersells the
gap: from scratch the model is right roughly 60% of the time and silently wrong
the rest, while the skill makes correctness deterministic.

## Examples

Six end-to-end examples live in [EXAMPLES.md](EXAMPLES.md). Each ships both an API-combinator
reader and an optimized, monomorphized one, with a runnable round-trip test and
a benchmark — so the speedups below are measured, not claimed (Node 24 / V8;
`npm run bench` for your own numbers):

| Example           | Columns                                              | Optimized speedup   |
| ----------------- | ---------------------------------------------------- | ------------------- |
| **orders**        | `UUID`, `Decimal64`, `Enum8`                         | **~3.4x**           |
| **carts**         | nested `Array(Tuple(...))`, `Array(Nullable(...))`   | **~2.0x**           |
| **telemetry**     | `Map`, `Array(Float64)`, `Nullable`, named `Tuple`   | **~1.4x**           |
| **observability** | `Variant`, `DateTime64(3)`, `LowCardinality`, nested | **~1.4x**           |
| **profiles**      | `Array(String)`, `Nullable(Int32)`                   | **~1.3x**           |
| **events**        | `UInt64`, `String`, `DateTime` scalars               | **~1.05x — on par** |

Two axes drive the win. **Composite structure** is one: monomorphization pays in
proportion to how many per-row combinator closures it removes (`carts` /
`telemetry` / `observability`). **Per-row formatting** is the other, independent
of composites: `orders` is all-scalar yet the biggest win (~3.4x), almost
entirely from swapping the BigInt UUID formatter for the lookup-table
`formatUUIDTable`. The genuinely flat case — a scalar row with no hot formatter
(`events`) — is on par, so the simpler API reader is the right call there.
Measure, don't assume.

## Scope

- **In scope (reading):** `RowBinary`, `RowBinaryWithNames`, and
  `RowBinaryWithNamesAndTypes` decoding for Node.js — full-buffer and streaming
  (chunked) via `advance()`/`NeedMoreData`, `readRows()`, and the async
  `streamRowBatches()` (with a built-in small-chunk warning and the optional
  `coalesceChunks()` debounce filter).
- **In scope (writing):** the inverse encode path — a `writeX` mirroring every
  `readX`, appending bytes to a `Sink`, plus `writeRows()`. Imported from
  `@clickhouse/rowbinary/writer`. A handful of decode-only paths are not yet
  mirrored: `Dynamic`, `JSON`, the runtime header/compile path, and the columnar
  typed-array path.
- **Out of scope (for now):** browsers and Edge runtimes, non-RowBinary formats
  (JSON / CSV / TSV / Parquet), and big-endian hosts.

## The spirit

A RowBinary codec generator is a narrow thing. But it's built as an instance of
a broader bet about what libraries become once a capable LLM is part of the
toolchain. Three shifts, each already visible in this repo:

- **Self-modifiable software.** The library deliberately ships _several_
  equivalent decoders for the same type — `readUUID` / `readUUIDBigInt` /
  `readUUIDHiLo`, `formatUUID` / `formatUUIDTable`, `new Array(n)` vs `[]`+push,
  streaming vs whole-buffer — because the fastest one depends on the workload,
  not the type. Today the agent picks at generation time from measured
  benchmarks. The next step is to pair the skill with a tracing layer that runs
  variant A against variant B _on the live workload_ and keeps whichever wins for
  this data shape and access pattern — a parser that re-tunes itself as the
  traffic drifts, instead of freezing one author's guess into a release.

- **Custom software.** The value here isn't a fixed high-level API; it's the
  benchmarked building blocks plus the judgment to combine them. So the end user
  doesn't bend their code to the authors' generic surface — they have the agent
  assemble the high-level API _they_ actually want, shaped to their queries, row
  shapes, and latency/memory budget. Two teams with different workloads grow two
  different libraries from the same primitives, and neither inherits a design
  decision that was only ever right for the original authors' use case.

- **Read-write libraries.** For either of the above to be safe, the source has to
  be legible to an LLM, not merely runnable. So this repo is written _read-write_:
  every tradeoff is commented where it's made — the per-column ClickHouse type
  annotations, the `SAFE TO TOGGLE` markers on the fast variants, each reader's
  doc comment carrying its exact monomorphized form. An LLM can
  read _why_ a decision was made and change it in depth with confidence — not
  just call the public functions, but safely rework the internals.

The through-line: the last mile is glue the LLM writes over stable, benchmarked
blocks, so the authors' job shrinks to exporting good primitives and documenting
their tradeoffs honestly — rather than trying to bake the right performance
constants for every possible workload into the library ahead of time.
