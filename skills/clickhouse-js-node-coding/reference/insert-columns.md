# Insert into Specific Columns / Other Databases

> **Applies to:** all versions. The `columns` option (both forms) and the
> `database` config field are universally supported.

## Answer checklist

When explaining partial-column inserts:

- Show `columns: ['col_a', 'col_b']` for the allowlist form.
- Also mention the inverse `columns: { except: ['col_to_skip'] }` form so the
  user knows both supported shapes.
- Explain that omitted columns receive their server-side defaults
  (`DEFAULT`, `MATERIALIZED`, `ALIAS`, nullable/type defaults) and inserts can
  still fail or produce surprising zero/empty values if the table definition
  has no appropriate defaults.

## Insert into specific columns

Pass `columns: string[]` to limit the `INSERT` to a subset. Omitted columns
get their declared default.

```ts
await client.insert({
  table: "events",
  columns: ["message"], // the rest of the events table columns get their DEFAULTs
  format: "JSONEachRow",
  values: [{ message: "foo" }],
});
```

## Insert excluding columns

Use `columns: { except: string[] }` for the inverse. Useful when most columns
should default but you want to name only the few to skip.

```ts
await client.insert({
  table: "events",
  format: "JSONEachRow",
  values: [{ message: "bar" }],
  columns: { except: ["id"] },
});
```

## Tables with EPHEMERAL columns

[Ephemeral columns](https://clickhouse.com/docs/en/sql-reference/statements/create/table#ephemeral)
are not stored — they only exist to drive `DEFAULT` expressions of other
columns. To trigger that default logic, **the ephemeral column must be in the
`columns` list**, even though no value will be persisted for it.

```ts
await client.command({
  query: `
    CREATE OR REPLACE TABLE events
    (
      id              UInt64,
      message         String DEFAULT message_default,
      message_default String EPHEMERAL
    )
    ENGINE MergeTree
    ORDER BY id
  `,
});

await client.insert({
  table: "events",
  format: "JSONEachRow",
  values: [
    { id: "42", message_default: "foo" },
    { id: "144", message_default: "bar" },
  ],
  // Including the ephemeral column name triggers the DEFAULT expression
  columns: ["id", "message_default"],
});
```

## Insert into a different database

If the client's default `database` is not the target, qualify the table name
with `db.table`:

```ts
const client = createClient({ database: "system" });

await client.command({ query: "CREATE DATABASE IF NOT EXISTS analytics" });

await client.insert({
  table: "analytics.events", // fully qualified
  format: "JSONEachRow",
  values: [{ id: 42, message: "foo" }],
});
```

There is no per-call `database` override on `insert()` / `query()` — qualify
the identifier, or create a second client with the desired `database`.

## Common pitfalls

- **Forgetting the ephemeral column in `columns`.** If you list only the
  non-ephemeral columns, the `DEFAULT` expression that depends on the
  ephemeral value won't fire and you'll get empty/zero defaults instead.
- **Hoping `client.insert({ database: '…' })` works.** It doesn't — qualify
  the `table` instead.
- **Mixing the two `columns` forms.** Use either `string[]` _or_
  `{ except: string[] }`, not both.
