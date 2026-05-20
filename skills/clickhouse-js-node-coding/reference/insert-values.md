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
})
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
    id: '00112233445566778899aabbccddeeff',
    timestamp: '2026-05-06 12:34:56',
    email: 'alice@example.com',
    name: 'Alice',
  },
  clickhouse_settings: { wait_end_of_query: 1 },
})
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
  table: 'events',
  format: 'JSONEachRow',
  values: [{ id: '42', dt: new Date() }],
  clickhouse_settings: {
    date_time_input_format: 'best_effort', // default on the Cloud
  },
})
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
})

await client.insert({
  table: 'prices',
  format: 'JSONEachRow',
  values: [
    {
      id: 1,
      dec32: '1234567.89',
      dec64: '123456789123456.789',
      dec128: '1234567891234567891234567891.1234567891',
      dec256:
        '12345678912345678912345678911234567891234567891234567891.12345678911234567891',
    },
  ],
})
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
  format: 'JSONEachRow',
})
```

## Common pitfalls

- **Using `client.insert()` for `INSERT … SELECT`.** There's nothing to
  upload — use `client.command()` with the full SQL.
- **Forgetting `date_time_input_format: 'best_effort'`** when inserting
  `Date` objects (or ISO strings). The default input format does not accept
  ISO-8601 with the `T`/`Z` separators.
- **Hand-building `VALUES` with user input.** Always parameterize user data;
  see `reference/query-parameters.md`.
- **Using floats in the app and expect `Decimal` columns to store them safely.** Use a proper decimal library and pass them as strings to avoid precision loss.
