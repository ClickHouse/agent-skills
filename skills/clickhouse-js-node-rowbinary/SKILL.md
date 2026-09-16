---
name: clickhouse-js-node-rowbinary
description: Implement or optimize ClickHouse RowBinary readers and writers in Node.js. Use for RowBinary, RowBinaryWithNames, and RowBinaryWithNamesAndTypes codecs; excludes browser runtimes.
metadata:
  version: "0.3.0"
---

# ClickHouse JS RowBinary Codec Generator for Node.js

This skill generates both directions of the wire format: **readers** (decode
bytes → values) and **writers** (encode values → bytes, the mirror). A given
task normally needs only one side. This file is the shared entry point — the
format scope plus the principles common to both directions; the per-direction
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

## Format and implementation scope

Honor a requested RowBinary format or an existing protocol requirement. When the user is choosing a format, use [format selection](format-selection.md) and benchmark representative data; format selection is not a gate before fulfilling an explicit codec request.

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

- **Specialize where it is useful.** Start from the per-type APIs. For a requested performance pass on a fixed schema, consider inlining leaf operations and specializing composites; keep changes supported by correctness checks and a representative benchmark. Routine integrations do not require bespoke code generation.

- **Keep type/offset behavior reviewable.** When generating inlined code, identify the ClickHouse type handled by each block where it is no longer clear from a function call.

- **Shared scratch is not reentrant.** Some hot methods reuse a module-level
  scratch buffer as a write-then-read pair — correct only because the access is
  fully synchronous. An `async`/`yield` boundary between populating and reading
  it corrupts the value.

- **Match the project language.** Use TypeScript for a new example when no language is specified; preserve an existing JavaScript project.

## Worked examples

Workload-specific examples and benchmark references are catalogued in [EXAMPLES.md](EXAMPLES.md).

## Out of scope

- **JSON / CSV / TSV / Parquet parsing** → use `clickhouse-js-node-coding`.
- **Connection errors, hangs, type mismatches** → use
  `clickhouse-js-node-troubleshooting`.
- **Browser / Web Worker / Edge** → `@clickhouse/client-web`.

## Still Stuck?

- [ClickHouse RowBinary format](https://clickhouse.com/docs/interfaces/formats#rowbinary)
- [ClickHouse data types](https://clickhouse.com/docs/sql-reference/data-types)
- [ClickHouse JS client docs](https://clickhouse.com/docs/integrations/javascript)
