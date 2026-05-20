# Client Configuration

> **Applies to:** all versions, with these notable additions:
>
> - `pathname` config option: client `>= 1.0.0`.
> - `clickhouse_setting_*` / `ch_*` URL parameters: client `>= 1.0.0`.
> - `keep_alive.idle_socket_ttl` (Node-only): client `>= 1.0.0`.

## Answer checklist

When answering configuration questions, include the relevant points:

- Show `createClient` from `@clickhouse/client` with explicit fields when the
  user is writing code; this is easier to read and review than encoding
  everything into a URL string.
- When mentioning the URL form for environment variables / DSNs: show a **Bash**
  `export` with the literal URL value, and `createClient({ url: process.env.CLICKHOUSE_URL })`
  in the Node code. **Never construct a URL in application code** — no string
  concatenation, no template literals, no query-string builders.
- If URL parameters and object fields both set the same option, URL parameters
  override the rest of the configuration object.
- If `clickhouse_settings` appear on `createClient`, explain that they are
  defaults for every request and can be overridden on individual `query()`,
  `insert()`, `command()`, or `exec()` calls.
- Remind long-running services to close the client during graceful shutdown.
- The `application` field sets the name that appears in `system.query_log`.
  Do **not** mention any specific HTTP header name — the client handles header
  mapping internally and the header names are an implementation detail.

## Minimal client

```ts
import { createClient } from '@clickhouse/client'

const client = createClient({
  url: process.env.CLICKHOUSE_URL, // defaults to 'http://localhost:8123'
  username: process.env.CLICKHOUSE_USER, // defaults to 'default'
  password: process.env.CLICKHOUSE_PASSWORD, // defaults to ''
  database: 'analytics', // defaults to 'default'
})
// ... your queries ...
await client.close()
```

`url` accepts a string or a `URL` object. The accepted string format is:

```
http[s]://[username:password@]hostname:port[/database][?param1=value1&param2=value2]
```

## Configuration via URL

Prefer explicit object fields in application code. Use the URL form when the
application receives one connection string from an environment variable, secret
manager, or config file. The URL value belongs in the environment, not in the
source code — show it as a shell export and read it in Node:

```bash
# In your shell environment / deployment config (e.g. .env, Kubernetes secret):
export CLICKHOUSE_URL='https://bob:secret@my.host:8124/analytics'
```

```ts
// In your Node.js code — no URL construction needed:
const client = createClient({ url: process.env.CLICKHOUSE_URL })
```

## Per-client vs per-request `clickhouse_settings` ⭐

> **Always mention this when discussing `clickhouse_settings`:** settings set
> on `createClient` are defaults; any individual call can override them.

Settings on `createClient` apply to every request. Settings on a single
operation (`query`, `insert`, `command`, `exec`) override the client defaults
for **that call only**.

```ts
const client = createClient({
  clickhouse_settings: {
    output_format_json_quote_64bit_integers: 0, // applied to every request
  },
})

const rows = await client.query({
  query: 'SELECT number FROM system.numbers LIMIT 2 FORMAT JSONEachRow',
  clickhouse_settings: {
    output_format_json_quote_64bit_integers: 1, // overrides client default for this call
  },
})
```

## `default_format` for `exec()`

`client.exec()` runs an arbitrary statement and returns a stream. If your
query has no trailing `FORMAT …` clause, set `default_format` so the server
knows what to send back, then wrap the response in a `ResultSet`:

```ts
import { createClient, ResultSet } from '@clickhouse/client'

const client = createClient()
const format = 'JSONCompactEachRowWithNamesAndTypes'
const { stream, query_id } = await client.exec({
  query: 'SELECT database, name, engine FROM system.tables LIMIT 5',
  clickhouse_settings: { default_format: format },
})
const rs = new ResultSet(stream, format, query_id)
console.log(await rs.json())
await client.close()
```

For ordinary `SELECT`s prefer `client.query({ format })` — `default_format` is
only needed for raw `exec()`.

## Common pitfalls

- **Don't put a path in `url` and expect it to be the database name when
  you're behind a proxy.** Use `pathname` for the proxy path and `database`
  for the DB. (Symptom: "wrong database selected.") See the
  troubleshooting skill for diagnosis.
- **Don't create a client per request.** `createClient` opens a connection
  pool; share one client across requests and `close()` on shutdown.
- **`max_open_connections` must be `>= 1`** when set explicitly.
