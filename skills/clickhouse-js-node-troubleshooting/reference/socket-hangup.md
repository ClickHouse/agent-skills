# Socket Hang-Up / ECONNRESET

**Symptom:** `socket hang up` or `ECONNRESET` errors, often intermittent.

**Root cause:** The server or load balancer closes the Keep-Alive connection before the client detects it and stops reusing the socket.

## Step 1 — Enable WARN-level logging to find dangling streams

> **Requires:** `>= 0.3.0` (logging support with `log.level` config option). In `>= 1.18.1`, the default log level changed from `OFF` to `WARN`, so this step may already be active. In `>= 1.18.2`, the client auto-emits a WARN log with Keep-Alive troubleshooting hints when an `ECONNRESET` is detected. In `>= 1.12.0`, a warning is logged when a socket is closed without fully consuming the stream.

```js
import { createClient, ClickHouseLogLevel } from '@clickhouse/client'

const client = createClient({
  log: { level: ClickHouseLogLevel.WARN },
})
```

Look for log lines about unconsumed or dangling streams — these are a common hidden cause.

## Step 2 — Check your ESLint setup

Add the [`no-floating-promises`](https://typescript-eslint.io/rules/no-floating-promises/) ESLint rule. Unhandled promises leave streams dangling, which can cause the server to close the socket.

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

> ⚠️ Node.js caps total received headers at ~16 KB. After ~70–80 progress headers, an exception is thrown. For very long queries, consider the alternative approach: fire-and-forget via the HTTP interface (mutations are not cancelled when the connection is lost — see the [client repo examples](https://github.com/ClickHouse/clickhouse-js/tree/main/examples)).

## Step 5 — Disable Keep-Alive entirely (last resort)

> **Requires:** `>= 0.1.1` (Keep-Alive disable option introduced in 0.1.1).

Adds overhead (new TCP connection per request) but eliminates all Keep-Alive issues:

```js
const client = createClient({
  keep_alive: { enabled: false },
})
```
