---
name: clickhouse-js-node-coding
description: Write application code using @clickhouse/client in Node.js. Use for client configuration, inserts, queries, parameters, sessions, and result handling; excludes the browser/edge client.
metadata:
  version: "0.2.0"
---

# ClickHouse Node.js client coding

Use the installed `@clickhouse/client` API and the project's Node.js conventions. Browser and edge code uses a different client; do not apply Node-only APIs there. Read the references needed by the task rather than every configuration topic.

## Core decisions

- Reuse an existing client where appropriate. Close short-lived clients after use and shared clients during graceful shutdown; a small edit does not need a new connection example.
- Bind user-controlled values with ClickHouse `{name: Type}` placeholders and `query_params`. Preserve type/precision semantics. Explain SQL injection when relevant to unsafe code, without requiring a stock warning in every answer.
- Choose `insert` for rows, `query` for results, `command` for statements without results, and `exec` when raw response streaming is needed. Consume or close result streams.
- JSONEachRow is a useful default for ordinary row data; respect a chosen format and use streaming for results that should not be buffered in memory.
- Client-level `clickhouse_settings` are request defaults; call-level settings can override them. Explain this when it affects the task.
- Check installed client, Node, and server versions for the feature in use. Reference version notes are starting points; verify uncertain defaults with current documentation or source.

## Task references

- [Client configuration](reference/client-configuration.md)
- [Compression](reference/compression.md)
- [Health and readiness probes](reference/ping.md)
- [Insert formats](reference/insert-formats.md)
- [Partial-column inserts](reference/insert-columns.md)
- [Expressions, dates, and decimals in inserts](reference/insert-values.md)
- [Asynchronous inserts](reference/async-insert.md)
- [Select formats and result consumption](reference/select-formats.md)
- [Query parameters](reference/query-parameters.md)
- [Sessions and temporary tables](reference/sessions.md)
- [Data types](reference/data-types.md)
- [Custom JSON serialization](reference/custom-json.md)

The decision points in references are facts to apply when relevant, not required sections or phrases for every response. A code answer should focus on the requested behavior and its material constraints.

## Further sources

- [Official client documentation](https://clickhouse.com/docs/integrations/javascript)
- [Runnable client examples](https://github.com/ClickHouse/clickhouse-js/tree/main/examples)

Use the troubleshooting skill for a reported client failure and the RowBinary skill for codec implementation. Neither is required for ordinary client code.
