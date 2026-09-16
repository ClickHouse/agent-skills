# Choosing a wire format

RowBinary exists for throughput, but it is **not automatically the fastest
path** — match the format to the shape of the data before committing to a
bespoke parser.

**Prefer a `JSON*` format (e.g. `JSONEachRow`) when** the result is mostly
strings / JSON-like values that you consume wholesale — randomly accessing
essentially every field, running string/regexp methods on them, treating values
as text. V8's native `JSON.parse` can be competitive with a JS-level RowBinary decoder on
these workloads. Compare decoding and wire costs with the compression supported by
the client and server; repeated JSON keys often compress well.

**Benchmark RowBinary when** the result is dominated by:

- **Wide numerics** — `Int128`/`Int256`/`UInt128`/`UInt256`,
  `Decimal128`/`Decimal256`.
- **Binary / fixed-width blobs** — `IPv4`, `IPv6`, `UUID`, `FixedString`.
- **High-volume fixed-width numeric columns** generally, where each value is a
  single `DataView` read.

**Consider the `Native` format when** columnar load and client-side analytics are
the main goal (fold/scan/filter columns, feed typed arrays to a Worker or WASM).
`Native` is column-oriented, but its blocks, encodings, and compression still need an appropriate decoder; it is not a raw typed-array memory image.

For help choosing and consuming a `JSON*` format (or CSV / TSV) instead, use the
**`clickhouse-js-node-coding`** skill.

Performance depends on schema, result consumption, compression, runtime, and chunk sizes. Use the case studies as evidence for their measured workloads, not universal guarantees.
