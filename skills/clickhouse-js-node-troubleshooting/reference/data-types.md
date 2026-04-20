# Data Type Mismatches

## Large integers returned as strings

> **Applies to:** all versions. The `output_format_json_quote_64bit_integers` ClickHouse setting is server-side and can be passed via `clickhouse_settings` in any client version.

`UInt64`, `Int64`, `UInt128`, `Int128`, `UInt256`, `Int256` are serialized as **strings** in `JSON*` formats to prevent overflow (they exceed `Number.MAX_SAFE_INTEGER`).

To receive them as numbers (use with caution — precision loss possible):

```js
const resultSet = await client.query({
  query: 'SELECT toUInt64(9007199254740993)',
  format: 'JSONEachRow',
  clickhouse_settings: { output_format_json_quote_64bit_integers: 0 },
})
```

> **Tip (`>= 1.15.0`):** BigInt values are now supported in query parameters, so you can safely pass large integers as bind params without string workarounds.

## Decimals losing precision on read

> **Applies to:** all versions (this is a ClickHouse JSON serialization behavior). For custom JSON parse/stringify (e.g., using a BigInt-safe parser), see `>= 1.14.0` which added configurable `json.parse` and `json.stringify` functions.

ClickHouse returns Decimals as numbers by default in `JSON*` formats. Cast to string in the query:

```js
const resultSet = await client.query({
  query: `
    SELECT toString(my_decimal) AS my_decimal
    FROM my_table
  `,
  format: 'JSONEachRow',
})
```

When inserting, always use the string representation to avoid precision loss:

```js
await client.insert({
  table: 'my_table',
  values: [{ dec64: '123456789123456.789' }],
  format: 'JSONEachRow',
})
```

## Format Selection Quick Reference

| Use case                    | Recommended format                  | Min version                           |
| --------------------------- | ----------------------------------- | ------------------------------------- |
| Insert/select JS objects    | `JSONEachRow`                       | all                                   |
| Bulk insert arrays          | `JSONEachRow`                       | all                                   |
| Stream large result sets    | `JSONEachRow`, `JSONCompactEachRow` | all                                   |
| CSV file streaming          | `CSV`, `CSVWithNames`               | all                                   |
| Parquet file streaming      | `Parquet`                           | `>= 0.2.6`                            |
| Single JSON object response | `JSON`, `JSONCompact`               | `JSON` all; `JSONCompact` `>= 0.0.14` |
| Stream with progress        | `JSONEachRowWithProgress`           | `>= 1.7.0`                            |

> ⚠️ `JSON` and `JSONCompact` return a single object and **cannot be streamed**.

## Date/DateTime insertion fails or produces wrong values

> **Applies to:** all versions. Note that `>= 0.2.1` changed Date object serialization to use time-zone-agnostic Unix timestamps instead of timezone-naive datetime strings, which fixed timezone mismatch issues between client and server.

- `Date` / `Date32` columns accept **strings only** (e.g., `'2024-01-15'`).
- `DateTime` / `DateTime64` columns accept strings **or** JS `Date` objects. To use `Date` objects, set:

```js
import { createClient } from '@clickhouse/client'
const client = createClient({
  clickhouse_settings: { date_time_input_format: 'best_effort' },
})
```
