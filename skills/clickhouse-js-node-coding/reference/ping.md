# Ping the Server

> **Applies to:** all versions. `ping()` returns a discriminated union
> `PingResult = { success: true } | { success: false, error: Error }` —
> it does **not** throw on connection failures.

## Answer checklist

When answering "how do I health-check / readiness-probe ClickHouse?":

- Use `await client.ping()` (or `ping({ select: true })`) and branch on
  `result.success` directly — **do not** wrap in `try/catch` as the only
  check, and do not substitute `query('SELECT 1')`.
- For a readiness probe / "can it serve traffic", recommend
  `client.ping({ select: true })` so credentials and the query layer are
  validated, not just the socket.
- **Always contrast the two forms explicitly in your answer**, even when
  you're recommending one: plain `client.ping()` hits `/ping` (TCP/HTTP
  reachability only — does not validate credentials or query processing);
  `client.ping({ select: true })` issues a lightweight `SELECT 1` (validates
  auth and query path). Name both and say which to use for liveness vs
  readiness.
- Recommend lowering `request_timeout` on the client used for probes so
  they fail fast instead of hanging on the default timeout — pick a value
  comparable to the probe interval (e.g., `1500`–`2000` ms for a
  2-second-interval probe).

## Successful ping

```ts
import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_URL,
  password: process.env.CLICKHOUSE_PASSWORD,
});

const pingResult = await client.ping();
if (pingResult.success) {
  console.info("ClickHouse is reachable");
} else {
  console.error("Ping failed:", pingResult.error);
}
await client.close();
```

Use `ping()` to:

- Probe ClickHouse at application startup.
- Wake up a ClickHouse Cloud instance that may be idling (a ping is enough to
  bring it out of sleep).
- Implement a `/healthz` / readiness endpoint.

## Failure: host unreachable

`ping()` does **not** throw — it resolves with
`{ success: false, error: Error }`, so you can branch without `try/catch`:

```ts
import type { PingResult } from "@clickhouse/client";
import { createClient } from "@clickhouse/client";

const client = createClient({
  url: "http://localhost:8100", // non-existing host
  request_timeout: 50, // keep failure fast
});

const pingResult = await client.ping();
if (hasConnectionRefusedError(pingResult)) {
  console.info("Connection refused, as expected");
} else {
  console.error("Ping expected ECONNREFUSED, got:", pingResult);
}
await client.close();

function hasConnectionRefusedError(
  pingResult: PingResult,
): pingResult is PingResult & { error: { code: "ECONNREFUSED" } } {
  return (
    !pingResult.success &&
    "code" in pingResult.error &&
    pingResult.error.code === "ECONNREFUSED"
  );
}
```

## Mapping to an HTTP health endpoint

```ts
app.get("/healthz", async (_req, res) => {
  const r = await client.ping();
  if (r.success) {
    res.status(200).json({ ok: true });
  } else {
    res.status(503).json({ ok: false, error: String(r.error) });
  }
});
```

## `ping()` vs `ping({ select: true })`

The default `ping()` hits ClickHouse's `/ping` HTTP endpoint — it verifies
network connectivity but **does not check credentials or query processing**.
A server that is reachable but has a bad password (or a broken query
pipeline) will still return `{ success: true }` from a plain `ping()`.

Pass `{ select: true }` to run a lightweight `SELECT 1` instead:

```ts
const r = await client.ping({ select: true });
// success only if the server is reachable AND auth is correct AND it can run queries
```

|                         | `client.ping()` | `client.ping({ select: true })` |
| ----------------------- | --------------- | ------------------------------- |
| Endpoint                | `/ping` (HTTP)  | `SELECT 1` query                |
| Checks auth             | **No**          | Yes                             |
| Checks query processing | No              | **Yes**                         |
| Overhead                | Minimal         | Slightly higher                 |

**When to use which:**

- **Liveness probe** (is the process alive?) — plain `ping()` is fine.
- **Readiness probe** (can it serve traffic?) — use `ping({ select: true })`
  so the probe fails if credentials are wrong or the query layer is broken.
- **Waking a ClickHouse Cloud idle instance** — plain `ping()` is enough.

## Common pitfalls

- **Do not wrap `ping()` in `try/catch` as your only check.** It resolves on
  failure; the `success` boolean is the source of truth.
- **Lower `request_timeout` if you want pings to fail fast** (the example
  above uses `50` ms). The default is high enough to be unsuitable for
  liveness probes.
- **Plain `ping()` does not check credentials.** If auth is part of what you
  want to verify, use `ping({ select: true })`.
- For ping that times out specifically, see the troubleshooting skill.
- **Only ping the ClickHouse server in your app's liveness probe** if the app
  has to be restarted to recover from a ClickHouse outage. If the app can recover
  the connection to ClickHouse without a restart, put the ping in a readiness
  probe instead so the app doesn't get killed unnecessarily.
