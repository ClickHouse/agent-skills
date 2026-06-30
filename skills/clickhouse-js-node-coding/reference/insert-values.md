# Insert Values, SQL Expressions, Dates, Decimals

> **Applies to:** all versions. `wait_end_of_query: 1` is a server-side
> setting available on every supported ClickHouse version.

## `INSERT … SELECT` (no values payload)

When the data already lives in ClickHouse, use `client.command()` with a raw
`INSERT … SELECT`:

```ts
await client.command({
  query: `
    INSERT INTO target
    SELECT * FROM source
  `,
});
```

Use `command()` (not `insert()`) — there is no row payload to send.

## `INSERT … VALUES` with SQL functions

When you need `unhex(...)`, `toUUID(...)`, `now()`, or any other SQL
function around a value, keep the SQL shape static and pass values with
ClickHouse `{name: Type}` parameters. Run it via `command()` and set
`wait_end_of_query: 1` for safety in clustered setups.

```ts
await client.command({
  query: `
    INSERT INTO events (id, timestamp, email, name)
    VALUES (
      unhex({id: String}),
      {timestamp: DateTime},
      {email: String},
      {name: Nullable(String)}
    )
  `,
  query_params: {
    id: "00112233445566778899aabbccddeeff",
    timestamp: "2026-05-06 12:34:56",
    email: "alice@example.com",
    name: "Alice",
  },
  clickhouse_settings: { wait_end_of_query: 1 },
});
```

Do not build `VALUES` rows with string interpolation or manual escaping. If
you need to insert many ordinary JS rows, prefer `client.insert()` with
`format: 'JSONEachRow'`; use this `command()` pattern when the SQL itself needs
functions or expressions around the values.

## Inserting JS `Date` objects

JS `Date` objects work for `DateTime` and `DateTime64` columns once the
server is set to accept ISO-8601 strings. Either set
`date_time_input_format: 'best_effort'` per request, on the client, or
session-wide.

```ts
await client.insert({
  table: "events",
  format: "JSONEachRow",
  values: [{ id: "42", dt: new Date() }],
  clickhouse_settings: {
    date_time_input_format: "best_effort", // default on the Cloud
  },
});
```

> JS `Date` objects do **not** work for the `Date` type (date-only) — pass
> `'YYYY-MM-DD'` strings for that.

## Inserting `Decimal*` values

**IMPORTANT:** Make sure that the application code you're working on or the user
prompt clearly indicates that floats are not used anywhere for decimal values.
The most common scenario is using floats for money amounts in the app while the
database uses `Decimal` for them. In that case, the app code should be changed
to use a proper decimal library and serialization strategy (custom serializer
or a class using `toJSON()`) to `string` instead of JS `number`.

Decimals must be passed as **strings** in JSON formats to avoid precision
loss in JavaScript:

```ts
await client.command({
  query: `
    CREATE OR REPLACE TABLE prices (
      id     UInt32,
      dec32  Decimal(9, 2),
      dec64  Decimal(18, 3),
      dec128 Decimal(38, 10),
      dec256 Decimal(76, 20)
    )
    ENGINE MergeTree ORDER BY id
  `,
});

await client.insert({
  table: "prices",
  format: "JSONEachRow",
  values: [
    {
      id: 1,
      dec32: "1234567.89",
      dec64: "123456789123456.789",
      dec128: "1234567891234567891234567891.1234567891",
      dec256:
        "12345678912345678912345678911234567891234567891234567891.12345678911234567891",
    },
  ],
});
```

When reading them back, cast to string in the SELECT to avoid the same
precision loss:

```ts
const rs = await client.query({
  query: `
    SELECT toString(dec64)  AS decimal64,
           toString(dec128) AS decimal128
    FROM prices
  `,
  format: "JSONEachRow",
});
```

## Inserting a `UUID` into a `UInt128` column

ClickHouse converts a `UUID` into `UInt128` implicitly **only for the `VALUES`
clause**. With the row-oriented JSON formats the client uses (e.g.
`JSONEachRow`), sending a UUID string such as
`'019982cb-3abf-7e12-9668-c788a9e3639c'` for a `UInt128` column fails with
`CANNOT_PARSE_INPUT_ASSERTION_FAILED`. Use one of two patterns instead.

**Pattern 1 — convert the UUID on the client and send it as a decimal string**
(recommended). A JS `number` cannot hold 128 bits without precision loss, so
always pass `UInt128` as a string:

```ts
import * as crypto from "node:crypto";

function uuidToUInt128(uuid: string): string {
  // 8-4-4-4-12 hex digits → 32 hex digits → BigInt → decimal string
  return BigInt("0x" + uuid.replace(/-/g, "")).toString();
}

await client.command({
  query: `
    CREATE OR REPLACE TABLE events (id UInt128, description String)
    ENGINE MergeTree ORDER BY id
  `,
});

const uuid = crypto.randomUUID();
await client.insert({
  table: "events",
  format: "JSONEachRow",
  values: [{ id: uuidToUInt128(uuid), description: "converted on the client" }],
});
```

`UInt128` values are also too wide for a JS `number` when reading back — cast
them with `toString(id)` in the `SELECT` to avoid precision loss.

**Pattern 2 — declare the UUID column as `EPHEMERAL`** and let ClickHouse
populate the `UInt128` column via its `DEFAULT` expression:

```ts
await client.command({
  query: `
    CREATE OR REPLACE TABLE events
    (
      id          UInt128 DEFAULT id_uuid,
      id_uuid     UUID EPHEMERAL,
      description String
    )
    ENGINE MergeTree ORDER BY id
  `,
});

await client.insert({
  table: "events",
  format: "JSONEachRow",
  values: [{ id_uuid: uuid, description: "populated via EPHEMERAL column" }],
  // The ephemeral column must be listed so the DEFAULT on `id` is evaluated.
  columns: ["id_uuid", "description"],
});
```

See `reference/insert-columns.md` for more on `EPHEMERAL` columns and why they
must appear in `columns`.

## Common pitfalls

- **Using `client.insert()` for `INSERT … SELECT`.** There's nothing to
  upload — use `client.command()` with the full SQL.
- **Forgetting `date_time_input_format: 'best_effort'`** when inserting
  `Date` objects (or ISO strings). The default input format does not accept
  ISO-8601 with the `T`/`Z` separators.
- **Hand-building `VALUES` with user input.** Always parameterize user data;
  see `reference/query-parameters.md`.
- **Using floats in the app and expect `Decimal` columns to store them safely.** Use a proper decimal library and pass them as strings to avoid precision loss.
- **Sending a UUID string for a `UInt128` column in `JSONEachRow`.** The
  implicit UUID → UInt128 cast only happens in the `VALUES` clause; in JSON
  formats convert the UUID to its 128-bit decimal string on the client (or use
  an `EPHEMERAL` UUID column with a `UInt128` `DEFAULT`).
