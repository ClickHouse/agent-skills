# Changelog — `@clickhouse/rowbinary`

> This file tracks the standalone `@clickhouse/rowbinary` package (the RowBinary
> parser library and agent skill). Entries relevant to it (through
> `@clickhouse/client` 1.23.0) were previously recorded in the now-frozen
> repository-wide [`CHANGELOG.md`](../../CHANGELOG.md).

# 0.2.0

## New features

- Added the RowBinary **writer** — the encode mirror of the reader: type-specific `writeX(sink, value)` building blocks and combinators that compose with no per-element closures, exported from `@clickhouse/rowbinary/writer` (or the per-type modules). ([#911])

  `writeRows(writeRow)` drives an `Iterable<T>` of rows into a plain `RowBinary` payload. Note its shape: it is a **streaming generator**, not a one-shot `Writer<readonly T[]>`. It writes into a fixed-size buffer (`bufferSize`, default 64 KiB), yields each batch of whole rows when the buffer fills — rewinding so a half-written row never leaks — and starts a fresh buffer for the rest, so a result larger than the buffer (or an unbounded row source) streams out chunk by chunk. An oversized row grows the buffer (doubling) rather than failing, and per-buffer fill is published on the `@clickhouse/rowbinary:writeRows.flush` `node:diagnostics_channel` for buffer-utilization metrics. ([#915])

  ```ts
  import {
    writeRows,
    writeTupleNamed,
    writeUInt64,
    writeString,
  } from "@clickhouse/rowbinary/writer";

  const writeRow = writeTupleNamed({ id: writeUInt64, name: writeString });
  for (const chunk of writeRows(writeRow)(rows, 64 * 1024)) send(chunk);
  ```

  Writer edge-case hardening: `writeDate`/`writeDate32`/`writeDateTime` floor to the calendar day / whole second instead of rounding (so a non-midnight `Date` or sub-second `DateTime` no longer rounds up); `parseIPv6` rejects malformed hex groups instead of silently encoding `0`; and `writeGeometry` validates the discriminant before writing its byte, so an out-of-range value can't leave a partial payload. ([#916])

[#911]: https://github.com/ClickHouse/clickhouse-js/pull/911
[#915]: https://github.com/ClickHouse/clickhouse-js/pull/915
[#916]: https://github.com/ClickHouse/clickhouse-js/pull/916

# 0.1.2

## Improvements

- Bumped the bundled `@clickhouse/datatype-parser` dependency to `0.1.2`. ([#895])
- Patch release. ([#903])

# 0.1.1

## New features

- Initial release of `@clickhouse/rowbinary`: a RowBinary reader library (and the companion agent skill) shipping type-specific, monomorphizable building blocks for decoding `RowBinary` / `RowBinaryWithNames` / `RowBinaryWithNamesAndTypes` streams (full-buffer and chunked), plus a skill that guides an agent to generate bespoke high-performance parsers from a query's column types. The same library is also bundled into `@clickhouse/client` (registered in `agents.skills`). Requires Node.js `>=20`. A matching RowBinary writer is planned. ([#864])

[#864]: https://github.com/ClickHouse/clickhouse-js/pull/864
[#895]: https://github.com/ClickHouse/clickhouse-js/pull/895
[#903]: https://github.com/ClickHouse/clickhouse-js/pull/903
