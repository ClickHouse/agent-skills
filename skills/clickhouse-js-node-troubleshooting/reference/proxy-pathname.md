# Proxy / Pathname URL Confusion

> **Requires:** `>= 1.0.0` (the `pathname` config option and URL-based configuration were introduced in 1.0.0). For `< 1.0.0`, a partial fix for pathname handling in the `host` parameter was shipped in `0.2.5`.

**Symptom:** Wrong database is selected, or requests fail when ClickHouse is behind a proxy with a path prefix (e.g., `http://proxy:8123/clickhouse_server`).

**Cause:** Passing the pathname in `url` makes the client treat it as the database name.

**Fix:** Use the `pathname` option separately:

```js
import { createClient } from '@clickhouse/client'

const client = createClient({
  url: 'http://proxy:8123',
  pathname: '/clickhouse_server', // leading slash optional; multiple segments supported
})
```

For proxies that require custom auth headers:

> **Requires:** `>= 1.0.0` (`http_headers` config option; replaces the deprecated `additional_headers` from `>= 0.2.9`). Per-request `http_headers` overrides are available since `>= 1.11.0`.

```js
import { createClient } from '@clickhouse/client'

const client = createClient({
  http_headers: {
    'My-Auth-Header': 'secret',
  },
})
```
