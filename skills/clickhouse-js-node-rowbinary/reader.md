# RowBinary reader (decode) for Node.js

Decoding a `RowBinary` / `RowBinaryWithNames` / `RowBinaryWithNamesAndTypes`
response from ClickHouse into JS values. Read [SKILL.md](SKILL.md) first for the
format gate ("is RowBinary even the right format?") and the principles that
apply to **both** directions; this file covers the decisions and the per-type
reference specific to **reading**. Writing? See [writer.md](writer.md).

## First: complete buffer, or incremental stream?

Decide this before writing the reader — it changes the shape of the code and is
a real performance fork.

- **Incremental / streaming (the default here).** You consume the HTTP response
  chunk by chunk as it arrives — low latency to the first row, bounded memory.
  It is generally the best choice for large results, but slower per-row.

- **Whole buffer in memory (faster, when it fits).** If you already hold the
  entire response as one `Buffer`, the bounds check never fires — so you can drop
  `advance()` entirely and read at a running offset in one monolithic loop.
  This is 2-3x faster but introduces latency and unbounded memory use.

The exposed API is streaming by default and requires an optimisation pass.

## Second: row objects, or columnar (typed arrays)?

The default output is one object per row (array-of-structs). For a **numeric,
fixed-width result that the consumer reads column-wise**, decode instead into one
typed array per column (struct-of-arrays) — it is **~4x faster and several times
smaller** because it removes the per-row object, `Date`, and number-boxing
allocations that dominate a numeric decode (the byte reads are already at memory
bandwidth). Measured in `tests/iot.columnar.bench.ts`; rationale in
`case-studies/wasm-vs-js.md`.

- **Use columnar when** columns are numeric/fixed-width and the consumer
  aggregates / filters / scans / plots them, or hands the buffers to a Worker or
  WASM kernel (typed-array `ArrayBuffer`s are transferable — zero-copy).
- **The preallocation trick:** if EVERY column is fixed-width the row stride is
  known, so the exact count is `buf.length / stride` — allocate each column once,
  write at `[i]`, no growth, no per-row bounds check.
- **Streaming columnar is just that arithmetic per chunk.** Fixed width means
  honoring a partial buffer needs no `advance()`/`NeedMoreData`/restart: the
  complete-row count is `(chunk.length / stride) | 0`, and the leftover bytes
  carry to the next chunk. Yield one typed-array batch per chunk, each owning a
  fresh transferable `ArrayBuffer` (see `streamSensorColumns` in
  `src/readers/columnar.ts`).
- **Stay row-oriented when** downstream code is row-shaped, the row is
  string-dominated (columnar's win is numeric — a JS string allocates either
  way), or the schema is nested/heterogeneous (`Array`/`Map`/`Tuple`).
- **Hybrid:** store columnar, expose a lazy `rowAt(i)` accessor that builds an
  object only for rows actually touched (see `iotRowAt` in `src/examples/iot.ts`).

## Third: are the column types known ahead of time?

- **Known (the default).** Generate a straight-line reader specialized to those
  types — everything below.
- **Only at runtime** (the schema varies, or you just want to decode an arbitrary
  `RowBinaryWithNamesAndTypes` stream). Call
  `compileRowBinaryWithNamesAndTypes(cursor)` (`src/readers/rowBinaryWithNamesAndTypes.ts`):
  it reads the header, folds each column type's AST into a `Reader`
  (`astToReader`, `src/readers/compile.ts`; type strings parsed by
  `@clickhouse/datatype-parser`), and returns a `readRows` driver for the rest of
  the stream. Generic and unoptimized (no codegen), so prefer the specialized
  path whenever the types are fixed.

## Reader guidance

On top of the shared principles in [SKILL.md](SKILL.md), the read path has its own:

- **Streaming: throw + restart, not generators.** To signal "need more bytes",
  a synchronous reader that throws a sentinel (`NeedMoreData`) and restarts the
  row beats generators for realistic chunk sizes.

- **Keep an eye on chunk sizes.** Partial trailing rows, small chunks are a silent
  throughput killer: `streamRowBatches` warns once when
  rows-per-chunk falls too low, and `coalesceChunks(source, { minSize, timeoutMs })`
  merges small chunks in front of it when the source size isn't yours to raise.

- **Hoist the cursor into locals.** Prefer the working buffer and view declared
  once at the top of the generated reader, and keep the read offset in a **local variable**,
  operating on it directly instead of re-reading from an object.

- **Coalesce `advance()` across adjacent fixed-width columns.** A run of
  neighbouring fixed-width columns has a known combined size, so bounds-check it
  ONCE.

- **Pre-allocate small result arrays.** RowBinary gives every array/map its
  element count up front (the LEB128 prefix), so DEFAULT is to `new Array(n)`.
  NOTE: for **large** arrays the application will iterate or compute over repeatedly,
  prefer `[]` + `push` (faster to traverse in V8) — or a typed array (`Float64Array`…)
  for numeric elements.

## Reader type family references

The readers live as real code under `src/readers/`, split by type family.

| Result contains (trigger)                                                                                                                      | Open                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Always** — cursor state, `advance()`, `NeedMoreData`, `Reader<T>`                                                                            | `src/readers/core.ts`                                                                                                                                                         |
| LEB128 length/count prefixes for `String`/`Array`/`Map` (`readUVarint`)                                                                        | `src/readers/varint.ts`                                                                                                                                                       |
| `Int8`–`Int256`, `UInt8`–`UInt256`                                                                                                             | `src/readers/integers.ts`                                                                                                                                                     |
| `Bool`                                                                                                                                         | `src/readers/bool.ts`                                                                                                                                                         |
| `Enum8`, `Enum16` (resolve to the value's name; `readInt8`/`readInt16` for the raw int)                                                        | `src/readers/enums.ts`                                                                                                                                                        |
| `Float32`, `Float64`, `BFloat16`                                                                                                               | `src/readers/floats.ts`                                                                                                                                                       |
| `Decimal32/64/128/256`, `Decimal(P, S)`                                                                                                        | `src/readers/decimals.ts`                                                                                                                                                     |
| `String`, `FixedString(N)`                                                                                                                     | `src/readers/strings.ts`                                                                                                                                                      |
| `UUID`                                                                                                                                         | `src/readers/uuid.ts`                                                                                                                                                         |
| `IPv4`, `IPv6`                                                                                                                                 | `src/readers/ip.ts`                                                                                                                                                           |
| `Date`, `Date32`, `DateTime`, `DateTime(tz)`, `DateTime64(P[, tz])`                                                                            | `src/readers/datetime.ts`                                                                                                                                                     |
| `Time`, `Time64(P)`                                                                                                                            | `src/readers/time.ts`                                                                                                                                                         |
| `IntervalNanosecond` … `IntervalYear`                                                                                                          | `src/readers/interval.ts`                                                                                                                                                     |
| `Array(T)`, `Map(K, V)`, `Tuple(...)`, `Nullable(T)`, `Variant(...)`, `QBit(...)`                                                              | `src/readers/composite.ts`                                                                                                                                                    |
| `Point`, `Ring`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon`, `Geometry`                                                        | `src/readers/geo.ts`                                                                                                                                                          |
| `Dynamic` (and `Variant`/`Interval`/`Nested`/`Dynamic` nested inside it)                                                                       | `src/readers/dynamic.ts`                                                                                                                                                      |
| `JSON`                                                                                                                                         | `src/readers/json.ts`                                                                                                                                                         |
| The whole result — loop rows to EOF (`readRows`)                                                                                               | `src/readers/rows.ts`                                                                                                                                                         |
| A chunked HTTP response — `streamRowBatches`, `coalesceChunks`                                                                                 | `src/readers/stream.ts`                                                                                                                                                       |
| The `RowBinaryWithNamesAndTypes` header — column names + type strings (`readHeader`)                                                           | `src/readers/header.ts`                                                                                                                                                       |
| Fold one parsed type AST into a `Reader` (`astToReader`) — AST in, reader out                                                                  | `src/readers/compile.ts`                                                                                                                                                      |
| **Types known only at runtime** — compile a whole header into a row reader (`compileRowBinaryWithNamesAndTypes`, `typeStringToReader`)         | `src/readers/rowBinaryWithNamesAndTypes.ts`                                                                                                                                   |
| **Numeric/fixed-width result read column-wise** (aggregate/scan/plot, hand to a Worker/WASM) → decode into typed arrays, not row objects (~4x) | `src/readers/columnar.ts` (`streamSensorColumns` — streaming, yields transferable typed-array batches); `decodeIotColumnar` in `src/examples/iot.ts` is the whole-buffer form |
| `LowCardinality(T)` — transparent, decode as `T`                                                                                               | `src/readers/lowCardinality.ts`                                                                                                                                               |
| `SimpleAggregateFunction(f, T)` — transparent, decode as `T`                                                                                   | `src/readers/simpleAggregateFunction.ts`                                                                                                                                      |
| `Nested(...)` — no wire of its own; `Array(Tuple(...))`                                                                                        | `src/readers/nested.ts`                                                                                                                                                       |
| `Nothing` — zero-width, never decoded (only wrapped)                                                                                           | `src/readers/nothing.ts`                                                                                                                                                      |
| `AggregateFunction(...)` — opaque state; finalize server-side                                                                                  | `src/readers/aggregateFunction.ts`                                                                                                                                            |
