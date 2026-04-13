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

Do **not** use string template literals to inject user values — this creates SQL injection risk.
