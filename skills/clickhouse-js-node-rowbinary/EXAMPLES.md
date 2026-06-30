# RowBinary reader examples

Six end-to-end examples. Each `src/examples/*.ts` exports TWO readers for the
same row — `readXRow` (built from the generic combinator API; easiest to read)
and `readXRowFast` (the optimized, monomorphized form: leaf reads inlined,
combinators flattened to straight-line loops, `advance()` coalesced over
fixed-width runs — still streaming-safe). The matching `tests/X.example.test.ts`
runs the full create → populate → read-back round trip against a live ClickHouse
server (verified, not illustrative), and `tests/X.bench.ts` decodes a large
`numbers()`-generated buffer with both readers (equivalence-checked before
timing) to measure the speedup.

To use one: find the example whose column types match your result, open its
reader, and adapt it. `readRows(readXRow)` drives a row reader over a whole
result; `streamRowBatches(chunks, readXRow)` drives it over a chunked HTTP stream.

| Example           | SQL schema (the trigger)                                                                                                                                                                                                      | Speedup             | Reader · Test                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **orders**        | `id UInt8, uid UUID, price Decimal64(2), status Enum8(...)`                                                                                                                                                                   | **~3.4x**           | [`src/examples/orders.ts`](src/examples/orders.ts) · [`tests/orders.example.test.ts`](tests/orders.example.test.ts)                             |
| **carts**         | `cart_id UInt32, items Array(Tuple(sku String, qty UInt16)), discounts Array(Nullable(Int32))`                                                                                                                                | **~2.0x**           | [`src/examples/carts.ts`](src/examples/carts.ts) · [`tests/carts.example.test.ts`](tests/carts.example.test.ts)                                 |
| **telemetry**     | `host String, tags Map(String,String), cpu Array(Float64), region Nullable(String), window Tuple(start UInt32, count UInt16)`                                                                                                 | **~1.4x**           | [`src/examples/telemetry.ts`](src/examples/telemetry.ts) · [`tests/telemetry.example.test.ts`](tests/telemetry.example.test.ts)                 |
| **observability** | `id UInt64, ts DateTime64(3), level Enum8, trace_id UUID, payload Variant(String,Int64,Float64), tags Map(LowCardinality(String),String), metrics Array(Tuple(LowCardinality(String),Float64)), attrs Array(Nullable(Int64))` | **~1.4x**           | [`src/examples/observability.ts`](src/examples/observability.ts) · [`tests/observability.example.test.ts`](tests/observability.example.test.ts) |
| **profiles**      | `id UInt32, tags Array(String), score Nullable(Int32)`                                                                                                                                                                        | **~1.3x**           | [`src/examples/profiles.ts`](src/examples/profiles.ts) · [`tests/profiles.example.test.ts`](tests/profiles.example.test.ts)                     |
| **events**        | `id UInt64, name String, ts DateTime('UTC')`                                                                                                                                                                                  | **~1.05x — on par** | [`src/examples/events.ts`](src/examples/events.ts) · [`tests/events.example.test.ts`](tests/events.example.test.ts)                             |

Speedups: Node 24 / V8, decoding a 20k-row buffer — read the ratio, not the
absolute hz, and run `npm run bench` for your own numbers. Two independent levers
drive them: **composite monomorphization** (removes per-row combinator closures —
`carts` / `telemetry` / `observability`) and **per-row formatting** (`orders` is
all-scalar yet the biggest win, almost entirely from the `formatUUIDTable` swap).
A flat scalar row with no hot formatter (`events`) is within noise, so prefer the
clearer API reader there. When in doubt, benchmark — the `*.bench.ts` files are
the template.

The readers live under `src/examples/` and are excluded from the published build
(`tsconfig.build.json`): reference material and test fixtures, type-checked by the
base `tsconfig.json` and run by the suite, not part of the package's public API.

## Columnar decode (struct-of-arrays) — the ~4x numeric path

The examples above produce one object per row (array-of-structs). For a
**numeric, fixed-width result the consumer reads column-wise** (aggregate / scan
/ filter / plot, or hand off to a Worker / WASM kernel), decode the same
row-major bytes directly into **one typed array per column** in the same single
pass — no per-row object, no `Date`, no number boxing. That removes the
allocation that dominates a numeric decode for a **measured ~4.2x**.

See example: [`decodeIotColumnar`](src/examples/iot.ts).
