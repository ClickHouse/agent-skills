# RowBinary writer (encode) for Node.js

Encoding JS values into a `RowBinary` payload to send to ClickHouse. Read
[SKILL.md](SKILL.md) first for the format gate ("is RowBinary even the right
format?") and the principles that apply to **both** directions; this file covers
what's specific to **writing**. Reading? See [reader.md](reader.md).

Each `writeX` encodes one value, appending its RowBinary bytes to a `Sink` (a
caller-supplied byte buffer plus the current write offset — state only, no write
methods). Leaf writers (`writeUInt8`, `writeString`, …) encode directly;
combinators (`writeArray`, `writeTuple`, …) take sub-writers and return a writer,
so composite types compose with no per-element closures. For the `Sink`/`Writer<T>`
types and how to drain the encoded bytes, see `src/writers/core.ts`. Import the
barrel as `@clickhouse/rowbinary/writer`, or a per-type module for just what you
need. (Structurally this is the mirror of the decode side in
[reader.md](reader.md), but you don't need the read side to write.)

## Writer guidance

On top of the shared principles in [SKILL.md](SKILL.md), the write path has its own:

- **Reserve before you write.** Every fixed-width write goes through `reserve()`,
  which bounds-checks against the fixed-length buffer and throws the `BufferFull`
  sentinel when the chunk is full — your cue to flush what's written and continue
  into a fresh buffer. Exact signature, return value, and throw contract are in
  `src/writers/core.ts`.

- **Coalesce `reserve()` across a run of adjacent fixed-width columns.** Their
  combined size is statically known, so reserve ONCE for the whole run and write
  each value at a constant offset off the returned base — one bounds-check instead
  of one per column. Only applies where every column in the run is fixed-width (a
  variable-width writer like `writeString` reserves on its own).

- **Hoist sink state into locals in the generated writer.** `Sink.buf`/`Sink.view`
  are `readonly`, so bind them to locals once at the top and address them directly
  instead of through `sink.` on every write. Keep the write position (`sink.pos`)
  in a local too — but sync it back to `sink.pos` before any `reserve()` or
  `BufferFull` throw, since those read and mutate it to decide capacity and where a
  flushed buffer resumes.

- **Stream the whole result with `writeRows`, not a one-shot writer.** When you
  need to encode a large or unbounded row source, reach for `writeRows` rather than
  a `Writer<readonly T[]>`: it owns a fixed buffer and yields it as a generator,
  streaming the result out chunk by chunk instead of demanding it all fit at once.
  It never leaks a half-written row (it rewinds to the last whole-row boundary
  before flushing) and never fails on a single big row (it grows the buffer to fit).
  It also publishes a per-flush diagnostics-channel event for buffer-utilization
  metrics. Signature, default buffer size, channel name and payload type, the
  growth/rewind details, and a usage example are all in `src/writers/rows.ts`.

- **No defensive validation on the hot path.** Don't add `isFinite`/`NaN`/range
  checks to `writeX`; document the precondition in JSDoc instead. Two narrow
  exceptions — framing-keeping checks and zero-cost parse-time helpers — are
  spelled out in [AGENTS.md](AGENTS.md); `src/writers/ip.ts` is the worked
  example (`writeIPv6`, `parseIPv6`).

- **Lossy time conversions floor, never round.** Every date/time writer in
  `src/writers/datetime.ts` drops the sub-unit it can't encode by flooring toward
  −∞, so a caller's value is never silently shifted _up_ to the wrong
  day/second/tick and pre-1970 instants stay correct (not rounded toward the
  epoch). See its JSDoc for the per-function specifics.

## Writer type family references

The writers live as real code under `src/writers/`, one file per type family
(same basenames as the readers, under the `writers/` directory).

| Value to encode (trigger)                                                               | Open                                     |
| --------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Always** — sink state, `reserve()`, `BufferFull`, `Writer<T>`                         | `src/writers/core.ts`                    |
| LEB128 length/count prefixes for `String`/`Array`/`Map` (`writeUVarint`)                | `src/writers/varint.ts`                  |
| `Int8`–`Int256`, `UInt8`–`UInt256`                                                      | `src/writers/integers.ts`                |
| `Bool` (`writeBool`)                                                                    | `src/writers/bool.ts`                    |
| `Enum8`, `Enum16` (`writeEnum8`/`writeEnum16`; pass the raw int)                        | `src/writers/enums.ts`                   |
| `Float32`, `Float64`, `BFloat16`                                                        | `src/writers/floats.ts`                  |
| `Decimal32/64/128/256`, `Decimal(P, S)` (`parseDecimal`)                                | `src/writers/decimals.ts`                |
| `String`, `FixedString(N)` (`writeString`/`writeStringBytes`/`writeFixedString`)        | `src/writers/strings.ts`                 |
| `UUID` (`writeUUID`, `parseUUID`)                                                       | `src/writers/uuid.ts`                    |
| `IPv4`, `IPv6` (`writeIPv4`/`writeIPv6`, `parseIPv4`/`parseIPv6`)                       | `src/writers/ip.ts`                      |
| `Date`, `Date32`, `DateTime`, `DateTime(tz)`, `DateTime64(P[, tz])`                     | `src/writers/datetime.ts`                |
| `Time`, `Time64(P)` (`parseTime`/`parseTime64`)                                         | `src/writers/time.ts`                    |
| `IntervalNanosecond` … `IntervalYear`                                                   | `src/writers/interval.ts`                |
| `Array(T)`, `Map(K, V)`, `Tuple(...)`, `Nullable(T)`, `Variant(...)`, `QBit(...)`       | `src/writers/composite.ts`               |
| `Point`, `Ring`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon`, `Geometry` | `src/writers/geo.ts`                     |
| The whole result — write rows from a value source (`writeRows`)                         | `src/writers/rows.ts`                    |
| `LowCardinality(T)` — transparent, encode as `T`                                        | `src/writers/lowCardinality.ts`          |
| `SimpleAggregateFunction(f, T)` — transparent, encode as `T`                            | `src/writers/simpleAggregateFunction.ts` |
| `Nested(...)` — no wire of its own; `Array(Tuple(...))`                                 | `src/writers/nested.ts`                  |
| `Nothing` — zero-width, never encoded (only wrapped)                                    | `src/writers/nothing.ts`                 |
| `AggregateFunction(...)` — opaque state; produce server-side                            | `src/writers/aggregateFunction.ts`       |

**No writer counterpart yet** — these reader paths are decode-only for now:
`dynamic.ts`, `json.ts`, `stream.ts`, the `RowBinaryWithNamesAndTypes`
header/compile/runtime path (`header.ts`, `compile.ts`,
`rowBinaryWithNamesAndTypes.ts`), and the columnar typed-array path
(`columnar.ts`). The AST-based dynamic encode path is intentionally not built.
