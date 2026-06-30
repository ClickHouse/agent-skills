# Data Type Mismatches

## Large integers returned as strings

> **Applies to:** all versions. The `output_format_json_quote_64bit_integers` ClickHouse setting is server-side and can be passed via `clickhouse_settings` in any client version.

`UInt64`, `Int64`, `UInt128`, `Int128`, `UInt256`, `Int256` are serialized as **strings** in `JSON*` formats to prevent overflow (they exceed `Number.MAX_SAFE_INTEGER`).

To receive them as numbers (use with caution — precision loss possible):

```js
const resultSet = await client.query({
  query: "SELECT toUInt64(9007199254740993)",
  format: "JSONEachRow",
  clickhouse_settings: { output_format_json_quote_64bit_integers: 0 },
});
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
  format: "JSONEachRow",
});
```

When inserting, always use the string representation to avoid precision loss:

```js
await client.insert({
  table: "my_table",
  values: [{ dec64: "123456789123456.789" }],
  format: "JSONEachRow",
});
```

## Inserting a UUID into a `UInt128` column fails (`CANNOT_PARSE_INPUT_ASSERTION_FAILED`)

> **Applies to:** all versions. This is a ClickHouse input-parsing behavior, not a client bug.

ClickHouse converts a `UUID` into `UInt128` implicitly **only for the `VALUES` clause**. With the row-oriented JSON formats the client uses (e.g. `JSONEachRow`), sending a UUID string such as `'019982cb-3abf-7e12-9668-c788a9e3639c'` for a `UInt128` column fails with `CANNOT_PARSE_INPUT_ASSERTION_FAILED`.

Fix it with one of two patterns:

**Pattern 1 — convert the UUID on the client and send it as a decimal string** (recommended). A JS `number` cannot hold 128 bits without precision loss, so always pass `UInt128` as a string:

```js
import * as crypto from "node:crypto";

function uuidToUInt128(uuid) {
  // 8-4-4-4-12 hex digits → 32 hex digits → BigInt → decimal string
  return BigInt("0x" + uuid.replace(/-/g, "")).toString();
}

const uuid = crypto.randomUUID();
await client.insert({
  table: "events",
  format: "JSONEachRow",
  values: [{ id: uuidToUInt128(uuid), description: "converted on the client" }],
});
```

Read `UInt128` back with `toString(id)` in the `SELECT` to avoid the same precision loss.

**Pattern 2 — declare the UUID column as `EPHEMERAL`** and let ClickHouse populate the `UInt128` column via its `DEFAULT` expression. The ephemeral column must be listed in `columns` so the `DEFAULT` is evaluated:

```js
// CREATE TABLE events (id UInt128 DEFAULT id_uuid, id_uuid UUID EPHEMERAL, description String) ...
await client.insert({
  table: "events",
  format: "JSONEachRow",
  values: [{ id_uuid: uuid, description: "populated via EPHEMERAL column" }],
  columns: ["id_uuid", "description"],
});
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
import { createClient } from "@clickhouse/client";
const client = createClient({
  clickhouse_settings: { date_time_input_format: "best_effort" },
});
```
