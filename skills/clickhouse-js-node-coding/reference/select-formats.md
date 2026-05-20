# Select Data Formats

> **Applies to:** all versions. `JSONEachRowWithProgress` requires client
> `>= 1.7.0`; see the in-repo performance examples under
> `examples/node/performance/`.

## Default choice: `JSONEachRow` → `.json<T>()`

Right answer for ~90% of selects when the result fits in memory.

```ts
import { createClient } from '@clickhouse/client'

interface Row {
  number: string
}

const client = createClient()
const rows = await client.query({
  query: 'SELECT number FROM system.numbers LIMIT 5',
  format: 'JSONEachRow',
})
const result = await rows.json<Row>() // Row[]
result.forEach((r) => console.log(r))
// { number: '0' }
// { number: '1' }
// ...
await client.close()
```

`UInt64`/`Int64` and other 64-bit integers are returned as **strings**
when `output_format_json_quote_64bit_integers=1`, to avoid JS precision
loss. If that setting is `0`, they may be returned as unquoted JSON
numbers instead. Note that in ClickHouse `>= 25.8`, this setting can
default to `0`; see the troubleshooting skill for ways to control that.

## Single-document `JSON` format with metadata

Use `JSON` (or `JSONCompact`) when you need ClickHouse's response envelope
(rows + meta + statistics + row count). Type the result with
`ResponseJSON<T>`:

```ts
import { createClient, type ResponseJSON } from '@clickhouse/client'

const client = createClient()
const rows = await client.query({
  query: 'SELECT number FROM system.numbers LIMIT 2',
  format: 'JSON',
})
const result = await rows.json<ResponseJSON<{ number: string }>>()
console.info(result.meta, result.data, result.rows, result.statistics)
await client.close()
```

> `JSON`, `JSONCompact`, `JSONStrings`, `JSONCompactStrings`,
> `JSONColumnsWithMetadata`, `JSONObjectEachRow` are **single-document**
> formats — they cannot be streamed. Use a `*EachRow` variant if you want
> to stream.

## Selecting raw text (CSV / TSV / CustomSeparated)

Use `.text()` (not `.json()`) for raw textual formats:

```ts
const rs = await client.query({
  query: 'SELECT number, number * 2 AS doubled FROM system.numbers LIMIT 3',
  format: 'CSVWithNames',
})
console.log(await rs.text())
```

Streaming raw text/Parquet line-by-line belongs in
[`examples/node/performance/`](https://github.com/ClickHouse/clickhouse-js/tree/main/examples/node/performance)
— in particular, Parquet exports use `client.exec()` and pipe the raw
response stream rather than `ResultSet.stream()` (see
[`select_parquet_as_file.ts`](https://github.com/ClickHouse/clickhouse-js/blob/main/examples/node/performance/select_parquet_as_file.ts)).

## Format chooser

| Use case                                                 | Format                                                                                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read rows as JS objects                                  | `JSONEachRow` _(default)_                                                                                                                                  |
| Read rows as positional tuples (smaller payload)         | `JSONCompactEachRow`                                                                                                                                       |
| Need `meta` / `statistics` / `rows` envelope             | `JSON` or `JSONCompact` + `ResponseJSON<T>`                                                                                                                |
| Read all values as strings (avoid number-precision loss) | `JSONStringsEachRow` / `JSONCompactStringsEachRow`                                                                                                         |
| Stream very large result                                 | `JSONEachRow` / `JSONCompactEachRow` (see [`examples/node/performance/`](https://github.com/ClickHouse/clickhouse-js/tree/main/examples/node/performance)) |
| Export to CSV/TSV/Parquet                                | `CSV*`, `TabSeparated*`, `Parquet` (see [`examples/node/performance/`](https://github.com/ClickHouse/clickhouse-js/tree/main/examples/node/performance))   |

## ResultSet methods

| Method               | Returns                                          | Notes                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `await rs.json<T>()` | `T[]` for `*EachRow`, single-doc shape otherwise | Buffers the full response                                                                                                                                                                                                                                                                                                            |
| `await rs.text()`    | `string`                                         | Buffers the full response — for textual formats only (CSV/TSV/etc.)                                                                                                                                                                                                                                                                  |
| `rs.stream()`        | Node `Readable` of `Row[]` chunks                | Use for large newline-delimited results (`JSONEachRow`/`JSONCompactEachRow`/`CSV`/`TSV`); **not** suitable for binary formats like `Parquet` — for those, use `client.exec()` and pipe the raw response stream (see [`examples/node/performance/`](https://github.com/ClickHouse/clickhouse-js/tree/main/examples/node/performance)) |
| `rs.close()`         | `void` (synchronous)                             | Always call if you obtained `stream()` and stop reading early                                                                                                                                                                                                                                                                        |

## Common pitfalls

- **Calling `.json()` on a `JSON` (single-doc) result and expecting an
  array.** You get a `ResponseJSON<T>` object; the rows are under
  `.data`. Use `JSONEachRow` if you want a flat array.
- **Leaving a `stream()` half-consumed.** This is a top cause of
  `ECONNRESET` on the _next_ request — fully iterate the stream or call
  `resultSet.close()` (synchronous — no `await`). (Diagnosis details live in the
  troubleshooting skill.)
- **Reaching for `.json()` on a CSV/TSV result.** Use `.text()` (or
  `.stream()` for large results).
