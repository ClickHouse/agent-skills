---
name: clickhouse-js-node-rowbinary
description: >
  Generate TypeScript/JavaScript code that reads/decodes AND writes/encodes
  ClickHouse RowBinary streams for the ClickHouse HTTP server.
  Use this skill whenever a user wants to parse or produce `RowBinary`,
  `RowBinaryWithNames`, or `RowBinaryWithNamesAndTypes`.
  Node.js only, doesn't cover browsers.
---

# ClickHouse JS RowBinary Codec Generator for Node.js

This skill generates both directions of the wire format: **readers** (decode
bytes → values) and **writers** (encode values → bytes, the mirror). A given
task normally needs only one side. This file is the shared entry point — the
format gate plus the principles common to both directions; the per-direction
decisions, guidance, and the per-type reference tables live in two sibling files.

**Pick your side — read only the one you need:**

- **Decoding a `RowBinary*` response** from ClickHouse into JS values →
  **[reader.md](reader.md)**. Streaming vs whole-buffer, row-objects vs columnar,
  fixed vs runtime schema, and the per-type reader reference.
- **Encoding JS values into a `RowBinary` payload** to send to ClickHouse →
  **[writer.md](writer.md)**. The `Sink`/`writeX` building blocks, `writeRows`
  streaming, and the per-type writer reference.

The per-type code is real, split by direction under `src/readers/` and
`src/writers/`.

## First: is RowBinary even the right format?

RowBinary exists for throughput, but it is **not automatically the fastest
path** — match the format to the shape of the data before committing to a
bespoke parser.

**Prefer a `JSON*` format (e.g. `JSONEachRow`) when** the result is mostly
strings / JSON-like values that you consume wholesale — randomly accessing
essentially every field, running string/regexp methods on them, treating values
as text. V8's native `JSON.parse` is heavily optimized C++ and builds JS strings
and objects faster than a JS-level RowBinary decoder can; pair it with HTTP
response compression (`gzip` / `zstd`, which crushes JSON's repetitive keys) and
the wire cost shrinks too.

**RowBinary clearly wins when** the result is dominated by:

- **Wide numerics** — `Int128`/`Int256`/`UInt128`/`UInt256`,
  `Decimal128`/`Decimal256`.
- **Binary / fixed-width blobs** — `IPv4`, `IPv6`, `UUID`, `FixedString`.
- **High-volume fixed-width numeric columns** generally, where each value is a
  single `DataView` read.

**Prefer the `Native` format when** columnar load and client-side analytics are
the main goal (fold/scan/filter columns, feed typed arrays to a Worker or WASM).
`Native` is column-major, so it loads straight into one typed array per column
with no transpose.

For help choosing and consuming a `JSON*` format (or CSV / TSV) instead, use the
**`clickhouse-js-node-coding`** skill.

## Core guidance (both directions)

These principles apply whether you are generating a reader or a writer; the
side-specific operational guidance is in [reader.md](reader.md) /
[writer.md](writer.md).

- **Little-endian only.** RowBinary is little-endian; target x86/ARM. Read and
  write every multi-byte number with `DataView` accessors passing a **literal**
  `true` for the `littleEndian` flag.

- **Correct first, then optimize.** First emit a correct codec built from the
  plain per-type API. Only after it's correct (and tested) specialize it. Don't
  bake performance assumptions in before correctness.

- **Monomorphize generic/composite types.** Emit specialized, inlined code per
  type combination instead of passing functions as arguments where the type is
  known ahead of time.

- **Inline the leaf ops.** The per-type `readX`/`writeX` functions are the
  correct, composable reference; the generated codec should INLINE their bodies,
  not call them, so the row loop is straight-line with no per-field indirection
  (and so the fixed-width coalescing can fold the offset arithmetic together).

- **Annotate the type per column.** Inlining erases the type structure, so put a
  short comment above each column's encode/decode block naming the ClickHouse
  type it handles.

- **Shared scratch is not reentrant.** Some hot methods reuse a module-level
  scratch buffer as a write-then-read pair — correct only because the access is
  fully synchronous. An `async`/`yield` boundary between populating and reading
  it corrupts the value.

- **TypeScript by default.** Generate TypeScript code and helpers unless the user
  explicitly asks for plain JavaScript.

## Worked examples

Six end-to-end examples with real speedup are catalogued in [EXAMPLES.md](EXAMPLES.md).

## Out of scope

- **JSON / CSV / TSV / Parquet parsing** → use `clickhouse-js-node-coding`.
- **Connection errors, hangs, type mismatches** → use
  `clickhouse-js-node-troubleshooting`.
- **Browser / Web Worker / Edge** → `@clickhouse/client-web`.

## Still Stuck?

- [ClickHouse RowBinary format](https://clickhouse.com/docs/interfaces/formats#rowbinary)
- [ClickHouse data types](https://clickhouse.com/docs/sql-reference/data-types)
- [ClickHouse JS client docs](https://clickhouse.com/docs/integrations/javascript)
