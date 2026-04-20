# Socket Hang-Up / ECONNRESET

**Symptom:** `socket hang up` or `ECONNRESET` errors, often intermittent.

**Root cause:** The server or load balancer closes the Keep-Alive connection before the client detects it and stops reusing the socket.

**Quick triage:**

- Errors on every request → likely dangling stream (Step 1–2)
- Errors only after idle periods → Keep-Alive timeout mismatch (Step 3)
- Errors on long-running queries (INSERT FROM SELECT, etc.) → load balancer idle timeout (Step 4)
- Can't diagnose → disable Keep-Alive as a last resort (Step 5)

## Step 1 — Enable WARN-level logging to find dangling streams

> **Requires:** `>= 0.2.0` (logging support with `log.level` config option). In `>= 1.18.1`, the default log level changed from `OFF` to `WARN`, so this step may already be active. In `>= 1.18.2`, the client auto-emits a WARN log with Keep-Alive troubleshooting hints when an `ECONNRESET` is detected. In `>= 1.12.0`, a warning is logged when a socket is closed without fully consuming the stream.

```js
import { createClient, ClickHouseLogLevel } from '@clickhouse/client'

const client = createClient({
  log: { level: ClickHouseLogLevel.WARN },
})
```

Look for log lines about unconsumed or dangling streams — these are a common hidden cause. A **dangling stream** is a query response stream that was never fully consumed or explicitly closed with `ResultSet.close()`. Because the Node.js client reuses sockets (Keep-Alive), leaving a stream open corrupts the socket and causes the _next_ request to fail with `ECONNRESET`. Errors on **every request** strongly suggest dangling streams rather than a Keep-Alive timeout mismatch.

**Common dangling stream patterns:**

```js
// ❌ Wrong — result stream never consumed; socket is left open
const resultSet = await client.query({ query: 'SELECT ...' })
// result is abandoned without calling .json(), .text(), .stream(), or .close()

// ❌ Wrong — stream created but not fully piped/iterated
const resultSet = await client.query({
  query: 'SELECT ...',
  format: 'JSONEachRow',
})
const stream = resultSet.stream()
// stream is never iterated and resultSet is never closed

// ✓ Correct — consume via .json()
const resultSet = await client.query({ query: 'SELECT ...' })
const data = await resultSet.json()

// ✓ Correct — consume via async iteration
const resultSet = await client.query({
  query: 'SELECT ...',
  format: 'JSONEachRow',
})
for await (const rows of resultSet.stream()) {
  // process rows
}

// ✓ Correct — explicitly close; this destroys the underlying socket immediately
const resultSet = await client.query({ query: 'SELECT ...' })
resultSet.close()
```

## Step 2 — Check your ESLint setup

Add the [`no-floating-promises`](https://typescript-eslint.io/rules/no-floating-promises/) ESLint rule. Unhandled promises leave streams dangling, which can cause the server to close the socket.

Even with `await`, if the returned `ResultSet` is not consumed (no `.json()`, `.text()`, `.close()`, or full stream iteration), the socket is left open. The ESLint rule catches the promise case; code review is needed for the "awaited but unconsumed result" case.

## Step 3 — Find the server's Keep-Alive timeout

```bash
curl -v --data-binary "SELECT 1" <your_clickhouse_url>
```

Check the response headers:

```
< Connection: Keep-Alive
< Keep-Alive: timeout=10
```

> **Requires:** `>= 0.3.0` (`keep_alive.idle_socket_ttl` was introduced in 0.3.0 with a default of 2500 ms, replacing the older `keep_alive.socket_ttl` from 0.1.1 which was removed in 0.3.0).

The default `idle_socket_ttl` in the client is **2500 ms**, which is safe for servers with a 3 s timeout (common in ClickHouse < 23.11). If your server has a higher timeout (e.g., 10 s), you can safely increase:

```js
const client = createClient({
  keep_alive: {
    idle_socket_ttl: 9000, // stay ~500ms below the server's timeout
  },
})
```

> ⚠️ If you still get errors after increasing, **lower** the value, not raise it.

> **Tip (`>= 1.18.3`):** Enable `keep_alive.eagerly_destroy_stale_sockets: true` to proactively destroy sockets that have been idle longer than `idle_socket_ttl` before each request. This helps when event loop delays prevent the idle timeout callback from firing on time.

## Step 4 — Long-running queries with no data in/out (INSERT FROM SELECT, etc.)

> **Requires:** `>= 1.0.0` (`request_timeout` default was fixed to 30 000 ms in 0.3.0; `url`-based configuration including `request_timeout` via URL params available since 1.0.0).

Load balancers may close idle connections mid-query. Force periodic progress headers:

```js
const client = createClient({
  request_timeout: 400_000, // e.g. 400s for long queries
  clickhouse_settings: {
    send_progress_in_http_headers: 1,
    http_headers_progress_interval_ms: '110000', // string — UInt64 type; set ~10s below LB idle timeout
  },
})
```

> ⚠️ Node.js caps total received headers at ~16 KB. After ~70–80 progress headers, an exception is thrown. For a query running longer than roughly `http_headers_progress_interval_ms * 75`, this limit will be hit — use a longer interval or the fire-and-forget approach below.

**Alternatively — fire-and-forget (mutations only):** Mutations (`INSERT ... SELECT`, `OPTIMIZE`, `ALTER`) are not cancelled on the server when the client connection is lost. You can send the mutation and immediately close the connection, then poll `system.query_log` or `system.mutations` for status. See the [client repo examples](https://github.com/ClickHouse/clickhouse-js/tree/main/examples) for a concrete implementation.

## Step 5 — Disable Keep-Alive entirely (last resort)

> **Requires:** `>= 0.1.1` (Keep-Alive disable option introduced in 0.1.1).

Adds overhead (new TCP connection per request) but eliminates all Keep-Alive issues:

```js
const client = createClient({
  keep_alive: { enabled: false },
})
```
