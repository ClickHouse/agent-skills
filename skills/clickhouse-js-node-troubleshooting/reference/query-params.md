# Query Parameters Not Interpolated

> **Applies to:** all versions. NULL parameter binding was fixed in `0.0.16`. Tuple support via `TupleParam` wrapper and JS `Map` as a query parameter were added in `>= 1.9.0`. BigInt values in query parameters are supported since `>= 1.15.0`. Boolean formatting in `Array`/`Tuple`/`Map` params was fixed in `>= 1.13.0`.

Use the `{name: type}` syntax in the query string and pass values via `query_params`:

```js
await client.query({
  query: 'SELECT plus({val1: Int32}, {val2: Int32})',
  format: 'CSV',
  query_params: { val1: 10, val2: 20 },
})
```

## Never use template literals for user values

When `$1`/`?` don't work, a common instinct is to interpolate values directly with a template literal. Don't — this bypasses ClickHouse's server-side escaping and opens the door to SQL injection:

```js
// ❌ Dangerous — never do this with user-controlled values
const userId = req.params.id
await client.query({ query: `SELECT * FROM users WHERE id = ${userId}` })

// ✓ Safe — parameterized
await client.query({
  query: 'SELECT * FROM users WHERE id = {id: UInt32}',
  query_params: { id: userId },
})
```

Always bring this up when answering query-params questions, especially when the user is coming from another database (PostgreSQL, MySQL, etc.) — they're the most likely to reach for template literals as a fallback.

## Common mistake: wrong parameter syntax

The ClickHouse JS client uses ClickHouse's native `{name: type}` syntax — not `$1`/`?`/`:name` placeholders from other databases:

```js
// ❌ Wrong — these don't work
await client.query({
  query: 'SELECT * FROM t WHERE id = $1',
  query: 'SELECT * FROM t WHERE id = ?',
  query: 'SELECT * FROM t WHERE id = :id',
  query_params: { id: 42 },
})

// ✓ Correct
await client.query({
  query: 'SELECT * FROM t WHERE id = {id: UInt32}',
  query_params: { id: 42 },
})
```

## Array parameters

```js
await client.query({
  query: 'SELECT * FROM t WHERE id IN {ids: Array(UInt32)}',
  format: 'JSONEachRow',
  query_params: { ids: [1, 2, 3] },
})
```

## Tuple parameters (`>= 1.9.0`)

Use the `TupleParam` wrapper to pass a tuple:

```js
import { TupleParam, createClient } from '@clickhouse/client'

const client = createClient({
  url: 'http://localhost:8123',
})

await client.query({
  query: 'SELECT {t: Tuple(UInt32, String)}',
  format: 'JSONEachRow',
  query_params: { t: new TupleParam([42, 'hello']) },
})
```

## Map parameters (`>= 1.9.0`)

Pass a JS `Map` directly:

```js
await client.query({
  query: 'SELECT {m: Map(String, UInt32)}',
  format: 'JSONEachRow',
  query_params: { m: new Map([['key', 1]]) },
})
```

## NULL parameters

Pass `null` directly — binding fixed in `0.0.16`:

```js
await client.query({
  query: 'SELECT {val: Nullable(String)}',
  format: 'JSONEachRow',
  query_params: { val: null },
})
```
