# Query Parameter Binding

> **Applies to:** all versions. NULL parameter binding fixed in `0.0.16`.
> Special-character (tab/newline/quote/backslash) binding `>= 0.3.1`.
> `TupleParam` and JS `Map` parameters `>= 1.9.0`. Boolean formatting in
> `Array`/`Tuple`/`Map` parameters fixed in `>= 1.13.0`. `BigInt` query
> parameters `>= 1.15.0`.

## Answer checklist

When the user passes user-controlled values into SQL:

- Use ClickHouse `{name: Type}` placeholders and a `query_params` object.
- **Your response must explicitly name template-literal / string
  interpolation of user input as a SQL injection risk** — even when the
  user only asked "how do I bind values" and did not mention security.
  This is non-negotiable: the security framing is part of the right
  answer, not an optional aside.
- Do not suggest PostgreSQL/MySQL-style `$1`, `?`, or `:name` placeholders.
- Pick the placeholder type to match the ClickHouse column type (`String`,
  `Date`, `DateTime`, `Nullable(T)`, etc.).

## Syntax: `{name: Type}`

ClickHouse uses `{name: Type}` placeholders — **not** `$1`, `?`, or `:name`.

```ts
await client.query({
  query: 'SELECT plus({a: Int32}, {b: Int32})',
  format: 'JSONEachRow',
  query_params: { a: 10, b: 20 },
})
```

The `Type` must be a valid ClickHouse type (`Int32`, `String`, `Date`,
`Array(UInt32)`, `Tuple(Int32, String)`, `Map(K, V)`, `Nullable(T)`, etc.).

## ⚠️ Never use template literals for user values

Interpolating user input into the SQL string bypasses server-side escaping
and opens the door to SQL injection:

```ts
const userId = req.params.id

// ❌ Dangerous — never do this with user-controlled values
await client.query({ query: `SELECT * FROM users WHERE id = ${userId}` })

// ✓ Safe — parameterized
await client.query({
  query: 'SELECT * FROM users WHERE id = {id: UInt32}',
  query_params: { id: userId },
})
```

This is the most common mistake for users coming from PostgreSQL/MySQL. Call
it out explicitly when the user shows template-literal interpolation.

## Common types

```ts
import { TupleParam } from '@clickhouse/client'

await client.query({
  query: `
    SELECT
      {var_int: Int32}                     AS var_int,
      {var_float: Float32}                 AS var_float,
      {var_str: String}                    AS var_str,
      {var_array: Array(Int32)}            AS var_array,
      {var_tuple: Tuple(Int32, String)}    AS var_tuple,
      {var_map: Map(Int, Array(String))}   AS var_map,
      {var_date: Date}                     AS var_date,
      {var_datetime: DateTime}             AS var_datetime,
      {var_datetime64_3: DateTime64(3)}    AS var_datetime64_3,
      {var_datetime64_9: DateTime64(9)}    AS var_datetime64_9,
      {var_decimal: Decimal(9, 2)}         AS var_decimal,
      {var_uuid: UUID}                     AS var_uuid,
      {var_ipv4: IPv4}                     AS var_ipv4,
      {var_null: Nullable(String)}         AS var_null
  `,
  format: 'JSONEachRow',
  query_params: {
    var_int: 10,
    var_float: '10.557',
    var_str: 'hello',
    var_array: [42, 144],
    var_tuple: new TupleParam([42, 'foo']), // >= 1.9.0
    var_map: new Map([
      [42, ['a', 'b']],
      [144, ['c', 'd']],
    ]), // >= 1.9.0
    var_date: '2022-01-01',
    var_datetime: '2022-01-01 12:34:56', // or a Date
    var_datetime64_3: '2022-01-01 12:34:56.789', // or a Date
    var_datetime64_9: '2022-01-01 12:34:56.123456789', // string for ns precision
    var_decimal: '123.45', // string to avoid precision loss
    var_uuid: '01234567-89ab-cdef-0123-456789abcdef',
    var_ipv4: '192.168.0.1',
    var_null: null, // fixed in 0.0.16
  },
})
```

### Type-by-type tips

- **Decimals** — pass as strings to avoid JS number precision loss.
- **`DateTime64(>3)`** — pass as a string; JS `Date` only has millisecond
  precision and will lose sub-millisecond digits.
- **`DateTime64`** — strings can also be UNIX timestamps, including
  fractional ones (e.g., `'1651490755.123456789'`).
- **`BigInt`** — supported in `query_params` since `>= 1.15.0`. On older
  clients, pass as a string.
- **`Tuple(...)`** — wrap in `new TupleParam([...])` (`>= 1.9.0`); on older
  clients, build the literal manually as a string.
- **`Map(K, V)`** — pass a JS `Map` (`>= 1.9.0`); on older clients, build
  it manually.
- **`Nullable(T)`** — pass `null` directly (`>= 0.0.16`).

## Special characters in string parameters (`>= 0.3.1`)

Tabs, newlines, carriage returns, single quotes, and backslashes are
escaped automatically by the client — just pass the JS string as-is:

```ts
await client.query({
  query: `
    SELECT
      'foo_\t_bar'  = {tab: String}             AS has_tab,
      'foo_\n_bar'  = {newline: String}         AS has_newline,
      'foo_\\'_bar' = {single_quote: String}    AS has_single_quote,
      'foo_\\_bar'  = {backslash: String}       AS has_backslash
  `,
  format: 'JSONEachRow',
  query_params: {
    tab: 'foo_\t_bar',
    newline: 'foo_\n_bar',
    single_quote: "foo_'_bar",
    backslash: 'foo_\\_bar',
  },
})
```

## Common pitfalls

- **`$1` / `?` / `:name` placeholders.** None work — use `{name: Type}`.
- **Forgetting the type in the placeholder.** `{id}` is a syntax error;
  it must be `{id: UInt32}`.
- **Stringifying tuples/maps manually on `>= 1.9.0`.** Use `TupleParam`
  and `Map` — both serialize correctly and respect special characters.
- **Boolean array/tuple/map elements before `1.13.0`.** Boolean formatting
  was fixed in 1.13.0 — earlier versions may misformat them.
