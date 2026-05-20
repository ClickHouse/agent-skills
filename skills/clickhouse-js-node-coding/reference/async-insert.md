# Async Inserts

> **Applies to:** all client versions; the relevant settings are server-side.
> See https://clickhouse.com/docs/en/optimize/asynchronous-inserts.

> **When to use async inserts:** when many small inserts arrive concurrently
> (e.g., one per HTTP request) and you don't want to maintain a client-side
> batching layer. ClickHouse will batch them server-side. This is also the
> recommended ingestion pattern for **ClickHouse Cloud**.

> **When _not_ to use async inserts:** when you already build large batches
> client-side (e.g., from a stream). Plain inserts are simpler and lower
> latency.

## Setup

Enable on the client level or per-request via `clickhouse_settings`:

```ts
import { createClient, ClickHouseError } from '@clickhouse/client'

const client = createClient({
  url: process.env.CLICKHOUSE_URL,
  password: process.env.CLICKHOUSE_PASSWORD,
  max_open_connections: 10,
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 1, // wait for ack from server
    async_insert_max_data_size: '1000000',
    async_insert_busy_timeout_ms: 1000,
  },
})
```

## Concurrent small inserts

Each call still uses the client's normal `insert()` API — the server merges
the batches.

```ts
const promises = [...new Array(10)].map(async () => {
  const values = [...new Array(1000).keys()].map(() => ({
    id: Math.floor(Math.random() * 100_000) + 1,
    data: Math.random().toString(36).slice(2),
  }))

  await client
    .insert({ table: 'async_insert_example', values, format: 'JSONEachRow' })
    .catch((err) => {
      if (err instanceof ClickHouseError) {
        // err.code matches a row in system.errors
        console.error(`ClickHouse error ${err.code}:`, err)
        return
      }
      console.error('Insert failed:', err)
    })
})

await Promise.all(promises)
```

## `wait_for_async_insert` — fire-and-forget vs ack

| `wait_for_async_insert` | Promise resolves when…                            | Trade-off                                                           |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| `1` (default)           | Server has flushed the batch to the table         | Slower per call; insert errors surface to the client                |
| `0`                     | Server accepted the row into its in-memory buffer | Faster; flush errors won't surface — only validation/parsing errors |

With `wait_for_async_insert: 1`, expect each insert call to take roughly
`async_insert_busy_timeout_ms` to resolve when traffic is light, because the
server waits for more rows or for the timer to fire before flushing.

## Combining DDL with async inserts

When creating tables in scripts that immediately insert, ack the DDL with
`wait_end_of_query: 1` so the table is ready before the first insert:

```ts
await client.command({
  query: `
    CREATE OR REPLACE TABLE async_insert_example (id Int32, data String)
    ENGINE MergeTree ORDER BY id
  `,
  clickhouse_settings: { wait_end_of_query: 1 },
})
```

Even better is to create a specialized client for inserts with the appropriate async
settings and a separate client for DDL and other queries.

## Common pitfalls

- **Setting `async_insert` per call but expecting client-side batching.**
  The client still issues each `insert()` as a separate HTTP request — the
  batching happens on the server.
- **Confusing `wait_for_async_insert` (async-insert ack) with
  `wait_end_of_query` (DDL ack).** They are unrelated.
- **Treating a resolved insert under `wait_for_async_insert: 0` as
  durably written.** It only means the server accepted the bytes; flush
  failures will not surface to the client.
- **Not handling `ClickHouseError`.** It exposes `err.code`, which maps to
  rows in the `system.errors` table — use it to decide whether to retry.

## See also

- For raw throughput tuning of large async-insert workloads,
  see [`examples/node/performance/`](https://github.com/ClickHouse/clickhouse-js/tree/main/examples/node/performance).
