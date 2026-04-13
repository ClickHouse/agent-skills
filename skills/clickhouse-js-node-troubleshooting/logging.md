# Logging Not Showing Anything

> **Requires:** `>= 0.2.0` (explicit `log.level` config option introduced in 0.2.0, replacing the `CLICKHOUSE_LOG_LEVEL` env var from 0.0.11). Custom `LoggerClass` also available since `>= 0.2.0`. In `>= 1.18.1`, the default changed from `OFF` to `WARN` and logging became lazy (messages only constructed if the log level matches). In `>= 1.18.1`, structured context fields (`connection_id`, `query_id`, `request_id`, `socket_id`) are available in logger `args`.

The default log level is **OFF** (for `< 1.18.1`) or **WARN** (for `>= 1.18.1`). Enable it explicitly:

```js
import { ClickHouseLogLevel } from '@clickhouse/client'

const client = createClient({
  log: {
    level: ClickHouseLogLevel.DEBUG, // TRACE | DEBUG | INFO | WARN | ERROR
  },
})
```

To use a custom logger (e.g., to pipe to your observability stack), implement the `Logger` interface:

```js
import type { Logger } from '@clickhouse/client'

class MyLogger implements Logger {
  debug({ module, message, args }) { /* ... */ }
  info({ module, message, args }) { /* ... */ }
  warn({ module, message, args, err }) { /* ... */ }
  error({ module, message, args, err }) { /* ... */ }
  trace({ module, message, args }) { /* ... */ }
}

const client = createClient({
  log: { LoggerClass: MyLogger, level: ClickHouseLogLevel.INFO },
})
```
