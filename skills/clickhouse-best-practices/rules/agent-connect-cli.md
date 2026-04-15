---
title: Use clickhouse-client for Batch Operations
impact: HIGH
impactDescription: "CLI has zero per-call overhead and handles large result sets efficiently"
tags: [agent, cli, connectivity, performance]
---

## Use clickhouse-client for Batch Operations

**Impact: HIGH**

For batch operations, scripting, and large result sets, `clickhouse-client` (or `clickhouse client`) is faster than MCP with no per-call overhead.

**Connection:**

```bash
# ClickHouse Cloud (native TLS on port 9440)
clickhouse client \
  --host abc123.clickhouse.cloud \
  --port 9440 \
  --secure \
  --user default \
  --password 'your-password'

# Self-managed (default native port 9000)
clickhouse client --host localhost --user default --password 'your-password'
```

**Where to find connection details (ClickHouse Cloud):**

1. Go to [console.clickhouse.cloud](https://console.clickhouse.cloud)
2. Click on your service → **Connect** in the left sidebar
3. The connection dialog shows the `clickhouse-client` command with host, port, and user pre-filled
4. Copy the command directly — you only need to add your password

**Key flags for agent use:**

```bash
clickhouse client \
  --host abc123.clickhouse.cloud --port 9440 --secure \
  --user default --password 'your-password' \
  --format JSON \
  --max_execution_time 30 \
  --result_overflow_mode break \
  --query "SELECT * FROM events LIMIT 100"
```

**Pipe pattern for agents:**

```bash
# Capture both stdout and stderr for the agent to parse
clickhouse client \
  --host abc123.clickhouse.cloud --port 9440 --secure \
  --user default --password 'your-password' \
  --query "SELECT database, name, engine FROM system.tables WHERE database != 'system'" \
  --format JSON 2>&1
```

**Format comparison:**

| Format | Best For | Includes Metadata | Tokens per 1K Rows |
|--------|----------|-------------------|---------------------|
| `JSON` | Single queries, agent needs types and row count | Column names, types, row count, statistics | High |
| `JSONEachRow` | Streaming large results, piping through `jq` | None | Medium |
| `TabSeparatedWithNames` | Simple tabular data, minimal token usage | Column names only | Low |
| `CSVWithNames` | Values containing tabs or special characters | Column names only | Low |

**Incorrect (no safety limits):**

```bash
# No timeout, no output format — agent can't parse reliably
clickhouse client --query "SELECT * FROM events"
```

**Correct (structured output with limits):**

```bash
clickhouse client \
  --format JSON \
  --max_execution_time 30 \
  --result_overflow_mode break \
  --query "SELECT * FROM events WHERE event_date = today() LIMIT 1000"
```

**Performance advantage over MCP:** No per-call connection overhead. An agent can run dozens of queries in sequence through a shell without the ~200-500ms setup penalty per call that MCP incurs.

Reference: [clickhouse-client](https://clickhouse.com/docs/interfaces/cli)
