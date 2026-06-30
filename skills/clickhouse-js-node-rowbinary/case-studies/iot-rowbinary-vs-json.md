# Case study: RowBinary vs JSON on a table of IoT readings

**TL;DR** — On a dense fixed-width numeric row, the skill's optimized RowBinary
reader decodes **3.5x faster than the best JSON format** (`JSONCompactEachRow`)
and **5.4x faster than `JSONEachRow`**, over a wire that is **1.6–3.3x smaller**.
This is the workload shape the [SKILL's format-choice
guidance](../SKILL.md#first-is-rowbinary-even-the-right-format) points at
RowBinary for — and the numbers below are _measured_, not assumed.

Reproduce: `npx vitest bench --run tests/iot.bench.ts` (against a live
ClickHouse server). Source: [`tests/iot.bench.ts`](../tests/iot.bench.ts),
reader: [`src/examples/iot.ts`](../src/examples/iot.ts).

## The data

A table of IoT sensor readings — every column fixed-width, not a string in the
row, so the whole record is a flat 41-byte run:

```sql
sensor_id   UInt32         -- 4 bytes
ts          DateTime64(3)  -- 8 bytes
temperature Float64        -- 8 bytes
humidity    Float64        -- 8 bytes
pressure    Float64        -- 8 bytes
battery     Float32        -- 4 bytes
status      UInt8          -- 1 byte
```

50,000 rows, fetched from a live server in three formats and decoded into
equivalent JS objects. A cross-format check asserts the RowBinary (binary
float) and JSON (decimal-text → float) decodes agree on every numeric column
before any timing is taken — so this measures the same work three ways, not
three different results.

## What was compared

- **RowBinary — optimized.** The skill's monomorphized reader: the seven column
  bounds checks coalesce into one `advance(s, 41)`, every field read at a
  constant offset off that base.
- **RowBinary — API combinators.** The same logic written with the plain
  per-type readers (`readUInt32`, `readFloat64`, …) — the clear default.
- **JSONCompactEachRow — `JSON.parse`.** Newline-delimited _arrays_ (no repeated
  keys). The strongest JSON contender a knowledgeable user would pick.
- **JSONEachRow — `JSON.parse`.** Newline-delimited _objects_ (keys repeated
  every row) — the naive idiomatic choice.

Both JSON paths use the fastest idiomatic decode: splice the rows into one
`[...]` document and hand it to V8's native `JSON.parse` in a single call.

## Wire size (HTTP response bytes)

| Format             | Size    | B/row | vs RowBinary |
| ------------------ | ------- | ----- | ------------ |
| RowBinary          | 2.05 MB | 41.0  | 1.0x         |
| JSONCompactEachRow | 3.38 MB | 67.6  | 1.6x         |
| JSONEachRow        | 6.68 MB | 133.6 | 3.3x         |

## Decode throughput (full 50k-row decode; higher = faster)

| Decoder                           | ops/s | ms/decode | ≈ rows/s | speedup  |
| --------------------------------- | ----- | --------- | -------- | -------- |
| **RowBinary — optimized**         | 399   | 2.50      | ~20.0 M  | **1.0x** |
| RowBinary — API combinators       | 159   | 6.31      | ~7.9 M   | 0.40x    |
| JSONCompactEachRow — `JSON.parse` | 114   | 8.76      | ~5.7 M   | 0.29x    |
| JSONEachRow — `JSON.parse`        | 74    | 13.47     | ~3.7 M   | 0.19x    |

_Node 24 / V8. Your numbers will vary; run `npm run bench` on your own hardware._

## Takeaways

- **This is the textbook RowBinary win.** High-volume fixed-width numerics where
  each field is one `DataView` read and there is no text to tokenize or numbers
  to parse from decimal strings. The monomorphization win (2.5x over the
  combinator API) is unusually large here because the whole row coalesces into a
  _single_ bounds check with constant-offset reads.
- **Format choice matters more than the optimization.** Even the plain
  combinator-API RowBinary reader (~7.9 M rows/s) beats the best JSON option —
  before any monomorphization.
- **The flip side still holds.** Had this been a string-heavy result (logs, JSON
  blobs, text consumed wholesale), `JSON.parse`'s optimized C++ would likely
  _win_, and the skill would steer you to `JSONEachRow` + compression instead.
  For IoT telemetry, RowBinary is clearly right — match the format to the shape
  of the data.
