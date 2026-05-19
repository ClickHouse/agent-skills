# Compression Not Working

> **Applies to:** all versions. Response compression was enabled by default in `< 1.0.0` and **disabled by default since `>= 1.0.0`** — you must explicitly enable it. Request compression has always been opt-in.

Both request and response compression are supported. Only **GZIP** is supported (via zlib).

```js
import { createClient } from '@clickhouse/client'
const client = createClient({
  compression: {
    response: true,
    request: true,
  },
})
```

## Compression enabled but getting an error?

If you enable `compression.response: true` and get a ClickHouse settings error, you are likely connecting as a `readonly=1` user. Response compression requires the `enable_http_compression` setting, which read-only users cannot change.

See [`reference/readonly-users.md`](./readonly-users.md) for the fix.

## Compression enabled but response doesn't seem compressed?

- Verify your version-specific defaults — response compression was enabled by default in `< 1.0.0` and is **disabled by default** in `>= 1.0.0`, so on newer versions you must enable `compression.response: true` explicitly.
- Check that the ClickHouse server has HTTP compression enabled (`enable_http_compression = 1` in server config). By default this is enabled on ClickHouse Cloud and most self-hosted setups.
- Request compression (`compression.request: true`) compresses the request body sent to ClickHouse. It has no effect on the response.
