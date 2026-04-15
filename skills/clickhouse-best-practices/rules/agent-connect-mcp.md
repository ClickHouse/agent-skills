---
title: Connect AI Agents to ClickHouse
impact: HIGH
impactDescription: "Proper connection setup eliminates credential-prompting friction and enables structured access"
tags: [agent, mcp, cli, connectivity, setup]
recommended_models:
  min: "haiku / gemini-flash / gpt-4o-mini"
  note: "Setup is procedural — follow the steps. No reasoning needed."
---

## Connect AI Agents to ClickHouse

**Impact: HIGH**

Two connection methods, each with a clear use case. Pick one based on your environment.

### Option A: MCP Server (interactive agent workflows)

Best for schema discovery, iterative analysis, and multi-step conversations.

**ClickHouse Cloud — zero-install hosted MCP:**

```bash
claude mcp add --transport http clickhouse-cloud https://mcp.clickhouse.cloud/mcp
```

Uses OAuth. Read-only. No env vars needed.

**Self-hosted MCP (any ClickHouse deployment):**

```bash
pip install mcp-clickhouse
```

| Variable | Example | Notes |
|----------|---------|-------|
| `CLICKHOUSE_HOST` | `abc123.clickhouse.cloud` | Hostname |
| `CLICKHOUSE_USER` | `default` | Database user |
| `CLICKHOUSE_PASSWORD` | `your-password` | Database password |
| `CLICKHOUSE_SECURE` | `true` | Always `true` for Cloud |

Enable writes: `export CLICKHOUSE_ALLOW_WRITE_ACCESS=true`

**Limitation:** MCP has ~200-500ms overhead per call. For large result sets or batch operations, use CLI.

### Option B: clickhouse-client (batch operations, large results)

Best for scripting, automation, and queries returning >10K rows. Zero per-call overhead.

```bash
clickhouse client \
  --host abc123.clickhouse.cloud --port 9440 --secure \
  --user default --password 'your-password' \
  --format JSON \
  --max_execution_time 30 \
  --query "SELECT * FROM events LIMIT 100" 2>&1
```

### Where to find connection credentials (ClickHouse Cloud)

1. Go to [console.clickhouse.cloud](https://console.clickhouse.cloud)
2. Click your service → **Connect** in the left sidebar
3. The dialog shows hostname, port, user, and a pre-built CLI command
4. **Reset password** if needed from the same dialog

For self-managed: check `config.xml` or ask your administrator.

### Output format selection

Always specify a format. The default (TabSeparated without headers) is unparseable by agents.

| Format | Tokens (1K rows) | Best For |
|--------|------------------|----------|
| `JSON` | High (~20K) | Single queries — includes column types, row count, statistics |
| `JSONEachRow` | Medium (~15K) | Streaming large results, piping through `jq` |
| `TabSeparatedWithNames` | Low (~4K) | Minimal tokens, simple tabular data |

Use `JSON` as the default for agent work. Switch to `TabSeparatedWithNames` when result sets are large and context window budget matters.

Reference: [ClickHouse MCP Server](https://github.com/ClickHouse/mcp-clickhouse) · [clickhouse-client](https://clickhouse.com/docs/interfaces/cli) · [Output Formats](https://clickhouse.com/docs/interfaces/formats)
