# Modern Data Types: Dynamic, Variant, JSON, Time, Time64

> **Applies to** (server side):
>
> - `Variant`: ClickHouse `>= 24.1`.
> - `Dynamic`: ClickHouse `>= 24.5`.
> - New `JSON` (object) type: ClickHouse `>= 24.8`.
> - All three are **no longer experimental since `25.3`**; on older servers,
>   you must enable the corresponding `allow_experimental_*_type` setting.
> - `Time` / `Time64`: ClickHouse `>= 25.6` and require
>   `enable_time_time64_type: 1`.

## Answer checklist

When answering about storing and reading JSON objects:

- Use the new `JSON` column type, introduced in ClickHouse `>= 24.8`.
- Say `JSON` is no longer experimental since ClickHouse `25.3`; on older
  supported versions, enable `allow_experimental_json_type`.
- **State the version policy in your explanation AND inline in the code.**
  When you set `allow_experimental_json_type` (or any `allow_experimental_*_type`)
  in code, you must do BOTH of the following:
  1. Put an inline comment directly above the setting that names the version
     where the type was introduced and the version where it became
     non-experimental. The comment is the durable version provenance — it
     lives in the user's source file long after the chat reply is gone.
  2. Repeat the version policy in your prose reply.

  For the `JSON` column type the inline comment must look like:

  ```ts
  clickhouse_settings: {
    // JSON type introduced in ClickHouse 24.8, non-experimental since 25.3.
    // This setting is required only on 24.8–25.2; harmless on >= 25.3.
    allow_experimental_json_type: 1,
  }
  ```

  Without the inline comment, a reader on a newer server has no idea the
  setting is a no-op and a reader on an older server has no idea why it's
  required.

- Insert real JS objects with `format: 'JSONEachRow'`; do not
  `JSON.stringify()` the column value.
- Read with a JSON output format such as `JSONEachRow` and `resultSet.json()`;
  `JSON` column values come back as parsed JS objects.

## `Dynamic`, `Variant(...)`, `JSON`

```ts
import { createClient } from '@clickhouse/client'

const client = createClient({
  clickhouse_settings: {
    // Variant introduced in 24.1, Dynamic in 24.5, JSON in 24.8.
    // All three are non-experimental since 25.3; these settings are
    // required only on 24.1–25.2 and are harmless on >= 25.3.
    allow_experimental_variant_type: 1,
    allow_experimental_dynamic_type: 1,
    allow_experimental_json_type: 1,
  },
})

await client.command({
  query: `
    CREATE OR REPLACE TABLE chjs_dynamic_variant_json
    (
      id      UInt64,
      var     Variant(Int64, String),
      dynamic Dynamic,
      json    JSON
    )
    ENGINE MergeTree
    ORDER BY id
  `,
})

await client.insert({
  table: 'chjs_dynamic_variant_json',
  format: 'JSONEachRow',
  values: [
    { id: 1, var: 42, dynamic: 'foo', json: { foo: 'x' } },
    { id: 2, var: 'str', dynamic: 144, json: { bar: 10 } },
  ],
})

const rs = await client.query({
  query: `
    SELECT *,
           variantType(var),
           dynamicType(dynamic),
           dynamicType(json.foo),
           dynamicType(json.bar)
    FROM chjs_dynamic_variant_json
  `,
  format: 'JSONEachRow',
})
console.log(await rs.json())
```

Outputs:

```js
;[
  {
    id: '1',
    var: '42',
    dynamic: 'foo',
    json: { foo: 'x' },
    'variantType(var)': 'Int64',
    'dynamicType(dynamic)': 'String',
    'dynamicType(json.foo)': 'String',
    'dynamicType(json.bar)': 'None',
  },
  {
    id: '2',
    var: 'str',
    dynamic: '144',
    json: { bar: '10' },
    'variantType(var)': 'String',
    'dynamicType(dynamic)': 'Int64',
    'dynamicType(json.foo)': 'None',
    'dynamicType(json.bar)': 'Int64',
  },
]
```

### Notes

- The `JSON` column type accepts a real JS object on insert and returns one
  on select — no need for `JSON.stringify` / `JSON.parse` in your app code.
- A JS number written into a `Dynamic` or `Variant` column defaults to
  `Int64` on the server. In JSON formats, `output_format_json_quote_64bit_integers`
  controls how 64-bit integers are returned: `1` returns them as JSON strings,
  while `0` returns them as JSON numbers (and `0` is the default since CH `25.8`).
  In JS, large 64-bit integers returned as numbers can lose precision, so use
  quoted output if you need exact integer values in application code.
- Use `variantType(...)`, `dynamicType(...)` to introspect what the server
  ended up storing.

## `Time` and `Time64(p)`

`Time` is signed seconds (`-999:59:59` … `999:59:59`). `Time64(p)` adds
sub-second precision (`p` digits, up to `9` for nanoseconds). Both require
`enable_time_time64_type: 1` on `>= 25.6`.

```ts
const client = createClient({
  clickhouse_settings: { enable_time_time64_type: 1 },
})

await client.command({
  query: `
    CREATE OR REPLACE TABLE chjs_time_time64
    (
      id    UInt64,
      t     Time,
      t64_0 Time64(0),
      t64_3 Time64(3),
      t64_6 Time64(6),
      t64_9 Time64(9),
    )
    ENGINE MergeTree
    ORDER BY id
  `,
})

await client.insert({
  table: 'chjs_time_time64',
  format: 'JSONEachRow',
  values: [
    {
      id: 1,
      t: '12:34:56',
      t64_0: '12:34:56',
      t64_3: '12:34:56.123',
      t64_6: '12:34:56.123456',
      t64_9: '12:34:56.123456789',
    },
    {
      id: 2,
      t: '999:59:59',
      t64_0: '999:59:59',
      t64_3: '999:59:59.999',
      t64_6: '999:59:59.999999',
      t64_9: '999:59:59.999999999',
    },
    {
      id: 3,
      t: '-999:59:59',
      t64_0: '-999:59:59',
      t64_3: '-999:59:59.999',
      t64_6: '-999:59:59.999999',
      t64_9: '-999:59:59.999999999',
    },
  ],
})
```

### Notes

- Pass values as **strings** in the `HH:MM:SS[.fraction]` format. Negatives
  are supported; the magnitude can exceed 24 hours.
- For `Time64(p)` with `p > 3`, do not use JS `Date` — it tops out at
  millisecond precision and will silently truncate. Store nanosecond values
  separately and provide on stringify as needed.

## Common pitfalls

- **Targeting old ClickHouse servers without the `allow_experimental_*`
  setting.** On `< 25.3`, `CREATE TABLE` will fail without them.
- **Expecting `JSON`-column reads to be raw strings.** They come back as
  parsed objects in JSON formats.
- **Inserting `Time64(9)` from JS `Date` and losing precision.** Use a
  string instead.
- **Reading a `Variant`/`Dynamic` value of type `Int64` and being surprised
  it's a string.** That's the standard 64-bit-integers-in-JSON behavior;
  see the troubleshooting skill if you need to change it.
- **Avoid parsing Variant/Dynamic/JSON columns that mix strings and 64-bit**
  without checking their returned types first. Otherwise a number stored in
  a string will come back as a number or vice versa.
