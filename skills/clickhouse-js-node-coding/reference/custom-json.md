# Custom JSON `parse` / `stringify`

> **Requires:** client `>= 1.14.0` (configurable `json.parse` and
> `json.stringify`). Earlier versions cannot swap the JSON implementation.

## Answer checklist

When the user wants `UInt64`/`Int64` values back as `BigInt`:

- State that configurable `json.parse` / `json.stringify` requires
  `@clickhouse/client >= 1.14.0`.
- Show the supported `createClient({ json: { parse, stringify } })` option,
  usually with `json-bigint` and `useNativeBigInt: true`.
- Combine it with `output_format_json_quote_64bit_integers: 0` so the server
  emits unquoted 64-bit integers that the parser can turn into `BigInt`.
- Mention that `output_format_json_quote_64bit_integers: 0` is the default
  since ClickHouse `25.8`, but setting it explicitly is useful for older
  servers or portable examples.
- Warn that casting to JavaScript `Number` / `parseInt` / `parseFloat` loses
  precision above `Number.MAX_SAFE_INTEGER`.

## Why customize?

The default `JSON.stringify` / `JSON.parse`:

- Throws on `BigInt`.
- Calls `Date.prototype.toJSON()` (ISO string) — fine for `DateTime` with
  `date_time_input_format: 'best_effort'`, surprising in some workflows.
- Loses precision for 64-bit integers returned as numbers (a separate
  issue — covered in the troubleshooting skill).

A custom `{ parse, stringify }` lets you plug in `JSONBig`,
`safe-stable-stringify`, your own `BigInt`-aware serializer, etc.

## Recipe: BigInt-safe stringify, custom Date handling

```ts
import { createClient } from "@clickhouse/client";

const valueSerializer = (value: unknown): unknown => {
  // Serialize Date as a UNIX millis number (instead of toJSON's ISO string)
  if (value instanceof Date) {
    return value.getTime();
  }

  // Serialize BigInt as a string so JSON.stringify won't throw
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(valueSerializer);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, valueSerializer(v)]),
    );
  }

  return value;
};

const client = createClient({
  json: {
    parse: JSON.parse, // use default parsing
    stringify: (obj: unknown) => JSON.stringify(valueSerializer(obj)),
  },
});

await client.command({
  query: `
    CREATE OR REPLACE TABLE inserts_custom_json_handling
    (id UInt64, dt DateTime64(3, 'UTC'))
    ENGINE MergeTree
    ORDER BY id
  `,
});

await client.insert({
  table: "inserts_custom_json_handling",
  format: "JSONEachRow",
  values: [
    {
      id: BigInt("250000000000000200"), // serialized as a string
      dt: new Date(), // serialized as ms since epoch
    },
  ],
});

await client.close();
```

> The custom `valueSerializer` runs **before** `JSON.stringify`, so values
> are transformed before the standard hooks (`Date.prototype.toJSON`,
> object `toJSON()` methods, etc.) ever run.

## Recipe: BigInt-safe parsing for 64-bit integer columns

If you want `UInt64`/`Int64` to come back as `BigInt`s (instead of strings
or precision-lossy numbers), plug in a `BigInt`-aware parser such as
[`json-bigint`](https://www.npmjs.com/package/json-bigint):

```ts
import { createClient } from "@clickhouse/client";
import JSONBig from "json-bigint";

const bigJson = JSONBig({ useNativeBigInt: true });

const client = createClient({
  json: {
    parse: bigJson.parse,
    stringify: bigJson.stringify,
  },
  clickhouse_settings: {
    output_format_json_quote_64bit_integers: 0,
  },
});
```

`output_format_json_quote_64bit_integers: 0` is the default since
ClickHouse `25.8`; setting it explicitly is useful for older servers and
makes the example self-contained. With it off, the server emits unquoted
64-bit integers that `json-bigint` parses straight to `BigInt`. The
`json` option applies to **both** outgoing JSON bodies and incoming
JSON-format responses.

## Recipe: Zero-dep BigInt parsing (no `npm install`)

If adding a dependency is awkward (locked lockfile, restricted environment,
or you just don't want to pull in `json-bigint`), you can plug in a
hand-rolled reviver. This uses the `context.source` argument that
`JSON.parse` revivers gained in Node `>= 20.16` / `>= 21.7`, so the raw
numeric literal is available before it's coerced to a JS `number`:

```ts
import { createClient } from "@clickhouse/client";

const parseBigInt = (text: string) =>
  JSON.parse(text, function (key, value, context) {
    if (key.endsWith("__bigint")) {
      return BigInt(context.source);
    }
    return value;
  });

const client = createClient({
  json: {
    parse: parseBigInt,
    stringify: JSON.stringify, // use default stringify
  },
  clickhouse_settings: { output_format_json_quote_64bit_integers: 0 },
});

const rs = await client.query({
  query: "SELECT toUInt64(250000000000000200) AS id__bigint",
});
const { data } = await rs.json();
console.log(data[0].id__bigint); // 250000000000000200

await client.close();
```

Trade-offs versus `json-bigint`:

- ✓ No new dependency to install.
- ✓ Only promotes known to be 64-bit integers to `BigInt`.
- ✗ Requires Node `>= 20.16` / `>= 21.7` for the reviver `context.source`.
  On older Node, prefer `json-bigint` or upgrade Node.
- ✗ Outgoing `stringify` still uses default `JSON.stringify`, which throws
  on `BigInt`. Pair with the `valueSerializer` pattern above if your
  inserts contain `BigInt` values.

## Common pitfalls

- **Setting `json.parse` only.** That only affects reading JSON responses;
  outgoing JSON bodies use `json.stringify`. If you want consistent custom
  handling in both directions, generally provide a matching `stringify` too
  or a throwing serializer that prevents mismatches.
- **Forgetting `bigint` handling in `stringify`.** Default `JSON.stringify`
  throws on `BigInt`; if your data ever contains one, the insert will fail
  with `TypeError: Do not know how to serialize a BigInt`.
- **Targeting client `< 1.14.0`.** The `json` option doesn't exist; you'll
  need to convert values manually before calling `insert()` / `query()` (or
  upgrade).
- **Casting 64-bit integers to `Number`.** JavaScript's `number` type has
  only 53 bits of mantissa — values above `Number.MAX_SAFE_INTEGER` (2^53 − 1)
  are silently rounded. Do **not** try to fix precision loss by calling
  `Number()`, `parseInt()`, or `parseFloat()` on the value. The correct fix
  is a `BigInt`-aware parser (shown above), not a lossy cast.
- **Mixing BigInt and number for the same column.** If some values are `BigInt` and
  others are `number`, your app code needs to handle both types. Otherwise
  JavaScript will throw a `TypeError: Cannot mix BigInt and other types`.
