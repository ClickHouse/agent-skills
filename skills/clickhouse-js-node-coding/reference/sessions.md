# Sessions and Temporary Tables

> **Applies to:** all versions. `session_id` is a server-level concept; the
> client just forwards it on every request that names it.

## Answer checklist

When answering "temp table disappears between calls" / "how do I share a
session" / anything involving `session_id`:

- State plainly that **temporary tables and session-scoped state are tied
  to a `session_id`** — without a stable `session_id` across calls, every
  request gets a fresh server-side session and the temp table is gone.
- Set `session_id` via `crypto.randomUUID()` either on `createClient` or
  per-call.
- Warn that **`session_id` on a global / module-static client is an
  anti-pattern** in any concurrent app (Express, server actions, workers,
  etc.) — concurrent requests will share the same session and trip
  `"Session is locked by a concurrent client"`. Recommend a short-lived
  per-workflow client or per-call `session_id` instead.
- If `session_id` is set on the client, also set `max_open_connections: 1`
  to serialize calls and avoid the concurrent-session error.
- For ClickHouse Cloud or any load-balanced deployment: **explicitly
  recommend replica-aware routing or a single-node hostname** as the
  primary remedy when sessions are needed. Sessions are pinned to one
  node; behind an LB, consecutive requests may land on different nodes
  and the temp table will appear to vanish. "Just collapse the workflow
  into one handler" or "use a non-temporary table" are valid fallbacks
  but secondary — name the routing fix first.

## When you need a session

Use a `session_id` whenever multiple calls must share **server-side state**:

- `CREATE TEMPORARY TABLE` (the table only exists within its session).
- `SET <setting> = <value>` to apply for subsequent queries on the same
  session.
- Any other server feature scoped per session (e.g., session-scoped
  variables in newer ClickHouse versions).

## ⚠️ `session_id` and concurrency

ClickHouse **rejects concurrent queries within the same session** — if two
requests arrive at the server at the same time sharing the same `session_id`,
the second one gets an error like
`"Session is locked by a concurrent client"`. This has two practical
implications:

1. **Do not set `session_id` on a global / module-static client** that handles
   concurrent requests (e.g., an Express app's shared client). Every
   in-flight request would share the same session and collide under load.
2. **If you do set `session_id` on a client**, restrict its concurrency:
   set `max_open_connections: 1` so at most one request is in flight at a
   time, turning the pool into a serial queue. This is fine for a
   dedicated per-workflow client but wrong for a shared application client.

The right pattern for application code: create a **short-lived client** (or
use per-request `session_id`) scoped to a single logical workflow, not to
the entire process.

## Per-client `session_id`

Appropriate when **one client handles exactly one sequential workflow** (a
script, a background job, a single user's session that you've already manually
serialized in the code).

```ts
import { createClient } from "@clickhouse/client";
import * as crypto from "node:crypto";

const client = createClient({
  session_id: crypto.randomUUID(),
  max_open_connections: 1, // safeguard against concurrent-session errors
});

await client.command({
  query: "CREATE TEMPORARY TABLE temporary_example (i Int32)",
});

await client.insert({
  table: "temporary_example",
  values: [{ i: 42 }, { i: 144 }],
  format: "JSONEachRow",
});

const rs = await client.query({
  query: "SELECT * FROM temporary_example",
  format: "JSONEachRow",
});
console.info(await rs.json());
await client.close();
```

## Session-level `SET` commands

`SET` only persists within a session. With `session_id` defined on the
client, every subsequent call inherits the change.

```ts
import { createClient } from "@clickhouse/client";
import * as crypto from "node:crypto";

const client = createClient({
  session_id: crypto.randomUUID(),
  max_open_connections: 1, // safe-guard against concurrent-session errors
});

await client.command({
  query: "SET output_format_json_quote_64bit_integers = 0",
  clickhouse_settings: { wait_end_of_query: 1 }, // ack before next call
});

const rs1 = await client.query({
  query: "SELECT toInt64(42)",
  format: "JSONEachRow",
});
// → 64-bit integers come back as numbers in this query

await client.command({
  query: "SET output_format_json_quote_64bit_integers = 1",
  clickhouse_settings: { wait_end_of_query: 1 },
});

const rs2 = await client.query({
  query: "SELECT toInt64(144)",
  format: "JSONEachRow",
});
// → 64-bit integers come back as strings again

await client.close();
```

> **`wait_end_of_query: 1` matters here.** Without it, a `SET` on one
> connection in the pool may not yet be applied when the next query lands
> on the same socket.

## Per-request `session_id`

You can also pass `session_id` on a single `query()` / `insert()` /
`command()` call to override (or set) it for that one request.

## ⚠️ Sessions and load balancers / ClickHouse Cloud

Sessions are bound to a **specific ClickHouse node**. If a load balancer in
front of ClickHouse routes consecutive requests to different nodes, the
temporary table / `SET` won't be visible — you'll get
`UNKNOWN_TABLE` / surprising results.

Mitigations (in order of preference):

- **For ClickHouse Cloud, use [replica-aware
  routing](https://clickhouse.com/docs/manage/replica-aware-routing)** so
  consecutive requests in the same session land on the same node. This is
  the right primary fix when you need sessions in a Cloud deployment.
- Talk to a single node directly (e.g., a node-pinned hostname) when
  routing isn't an option.
- As a fallback only: avoid sessions for cross-node workflows and persist
  intermediate state in a regular (non-temporary) table instead. This
  trades the session requirement away rather than fixing it — use it only
  if replica-aware routing / single-node connections aren't available.

## Common pitfalls

- **Forgetting `session_id` and being surprised that
  `CREATE TEMPORARY TABLE` "disappears."** Without a session, every request
  may land on a different connection / server context.
- **Setting `session_id` on a shared application client.** Under concurrent
  load, two in-flight requests will share the same session and one will fail
  with `"Session is locked by a concurrent client"`. Use per-request
  `session_id` or a dedicated short-lived client instead.
- **Reusing the same `session_id` across unrelated workflows.** A second
  session-using consumer will trip over your temporary tables and `SET`
  values. Generate a fresh UUID per logical session.
- **Leaving session state pinned for the lifetime of the process.** If
  long-lived clients accumulate `SET` / temp-table state, consider creating
  a short-lived sub-client with its own `session_id` for the unit of work.
- **Skipping `wait_end_of_query: 1` on `SET`** — race conditions between
  `SET` and the next query can show up under load.
