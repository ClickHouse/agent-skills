# Case study: JSON beats RowBinary on a string-heavy log table

**TL;DR** — This is the honest counter-case. When the result is mostly **text
consumed wholesale** (an application log table), `JSONCompactEachRow` +
`JSON.parse` decodes **1.4x faster** than the optimized RowBinary reader — and
once you turn on HTTP compression, RowBinary's raw-wire size advantage
**disappears**: gzip ties the two, and with **zstd the JSON response is actually
slightly smaller**. For this shape the skill steers you _away_ from RowBinary —
and proving that is what makes its "use RowBinary here" advice (see the
[IoT](iot-rowbinary-vs-json.md) and [ledger](ledger-rowbinary-vs-json.md)
studies) trustworthy.

This is exactly what the [SKILL's format-choice
guidance](../SKILL.md#first-is-rowbinary-even-the-right-format) says: prefer a
`JSON*` format when the result is "mostly strings / JSON-like values that you
consume wholesale," because V8's native `JSON.parse` is heavily optimized C++
and "pair it with HTTP response compression (`gzip` / `zstd`, which crushes
JSON's repetitive keys)."

Reproduce: `npx vitest bench --run tests/logs.bench.ts` (against a live
ClickHouse server). Source: [`tests/logs.bench.ts`](../tests/logs.bench.ts),
reader: [`src/examples/logs.ts`](../src/examples/logs.ts).

## The data

An application log table — four of five columns are text consumed as text:

```sql
ts        DateTime
level     LowCardinality(String)   -- transparent in RowBinary -> plain String
service   LowCardinality(String)
message   String                   -- templated log line, varying values
trace_id  String                   -- high-cardinality 32-char hex
```

50,000 rows, fetched from a live server. The two `LowCardinality` columns carry
no dictionary on the RowBinary wire — they decode as plain `String`.

## Decode throughput (full 50k-row decode; higher = faster)

| Decoder                               | ops/s | ms/decode | ≈ rows/s | speedup  |
| ------------------------------------- | ----- | --------- | -------- | -------- |
| **JSONCompactEachRow — `JSON.parse`** | 93    | 10.73     | ~4.7 M   | **1.0x** |
| JSONEachRow — `JSON.parse`            | 72    | 13.89     | ~3.6 M   | 0.77x    |
| RowBinary — optimized (monomorphized) | 66    | 15.07     | ~3.3 M   | 0.71x    |
| RowBinary — API combinators           | 54    | 18.68     | ~2.7 M   | 0.57x    |

`JSONCompactEachRow` (arrays, no repeated keys) is the fastest JSON option and
beats even the optimized RowBinary reader by ~1.4x. A RowBinary string is a
varint length + `buf.toString("utf8", …)` decoded one field at a time in JS;
`JSON.parse` builds the same JS strings in one optimized C++ pass.

## Wire size — raw, and compressed (gzip / zstd)

| Format             | raw     | gzip    | zstd    |
| ------------------ | ------- | ------- | ------- |
| RowBinary          | 5.04 MB | 1.46 MB | 1.35 MB |
| JSONCompactEachRow | 6.84 MB | 1.51 MB | 1.32 MB |
| JSONEachRow        | 8.84 MB | 1.52 MB | 1.33 MB |

RowBinary is 1.4–1.8x smaller **raw**, which is the usual argument for it. But
that edge is mostly JSON's repeated structure (keys, punctuation) — exactly what
a compressor removes. With `gzip` the three are within ~4% of each other, and
with `zstd` the JSON responses are _slightly smaller_ than RowBinary. Any
production HTTP path should have compression on, so the wire-size case for
RowBinary on this data effectively vanishes.

_Node 24 / V8. Your numbers will vary; run `npm run bench` on your own hardware._

## Takeaways

- **JSON wins both axes here.** Faster to decode (~1.4x) _and_, once compressed,
  no larger on the wire. There is no reason to hand-write a RowBinary parser for
  this shape.
- **`JSONCompactEachRow` is the one to reach for** — it drops the per-row
  repeated keys, so it parses faster than `JSONEachRow` and compresses about the
  same.
- **Compression erases RowBinary's raw-size advantage on text.** RowBinary's
  smaller raw wire comes largely from not repeating keys; a compressor already
  does that for JSON. Always compare _compressed_ sizes when the data is
  string-heavy.
- **This is the boundary of the skill.** RowBinary earns its keep on
  numeric/wide/binary data ([IoT](iot-rowbinary-vs-json.md),
  [ledger](ledger-rowbinary-vs-json.md)); on string-heavy results read as text,
  the right answer is `JSONCompactEachRow` + compression. Match the format to the
  shape of the data — and measure.
