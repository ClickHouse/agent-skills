---
title: Connect AI Agents to ClickHouse
impact: HIGH
impactDescription: "Proper connection setup eliminates credential-prompting friction and enables structured access"
tags: [agent, mcp, cli, connectivity, setup]
---

## Connect AI Agents to ClickHouse

**Impact: HIGH**

Use an existing authorized MCP, CLI, or HTTP connection when live access is needed. Reuse configured credentials without displaying secrets. Offline review does not need a connection; configuring new integrations or enabling writes is only appropriate when the task calls for it.

**Incorrect (prompting for credentials every time):**

```python
# Agent asks the user for host, port, user, password on every session
# Credentials are hardcoded in the prompt or conversation
response = client.query("SELECT 1",
    host="???", user="???", password="???")  # fragile, unsecured
```

**Correct (MCP or CLI with pre-configured credentials):**

```bash
# MCP: credentials configured once via env vars or OAuth
claude mcp add --transport http clickhouse-cloud https://mcp.clickhouse.cloud/mcp

# CLI: credentials in a named profile or env vars
clickhouse client --host abc123.clickhouse.cloud --port 9440 --secure \
  --user default --password "$CLICKHOUSE_PASSWORD" --format JSON \
  --query "SELECT 1"
```

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

Keep read-only access for analysis. If a requested write requires enabling access, first verify that the user authorized that operation; a connection setup example is not permission to enable writes.

**Limitations:**
- For large result sets or batch operations, consider CLI/HTTP streaming and the available tool limits.
- MCP's `list_tables` may not surface column `COMMENT` annotations — query `system.columns` directly for full schema context (see `agent-discovery-schema`).

**ClickHouse Cloud note:** Services can be idle/sleeping. The first query after inactivity may take 10-20 seconds while the service wakes up. An initial timeout or `503` may indicate wake-up; a bounded retry of a read can be appropriate. Diagnose persistent errors rather than assuming wake-up.

### Option B: clickhouse-client (batch operations, large results)

Best for scripting, automation, and queries returning >10K rows. Choose based on the installed tools and output needs.

```bash
clickhouse client \
  --host abc123.clickhouse.cloud --port 9440 --secure \
  --user default --password "$CLICKHOUSE_PASSWORD" \
  --format JSON \
  --max_execution_time 30 \
  --query "SELECT * FROM events LIMIT 100" 2>&1
```

### Option C: HTTP interface (fallback when CLI is unavailable)

If you have credentials but can't install `clickhouse-client` (lambda, sandbox, web-based agent), use the HTTP interface directly:

```bash
curl -s "https://abc123.clickhouse.cloud:8443/" \
  -H "X-ClickHouse-User: default" \
  -H "X-ClickHouse-Key: your-password" \
  --data-binary "SELECT name, engine FROM system.tables WHERE database = 'default' FORMAT JSON"
```

Port `8443` is HTTPS. Pass query settings as URL params: `?max_execution_time=30&max_result_rows=10000`.

### Where to find connection credentials (ClickHouse Cloud)

1. Go to [console.clickhouse.cloud](https://console.clickhouse.cloud)
2. Click your service → **Connect** in the left sidebar
3. The dialog shows hostname, port, user, and a pre-built CLI command
4. If credentials are unavailable, request the missing access. Resetting a password may affect other clients and requires specific authorization.

For self-managed: check `config.xml` or ask your administrator.

### Output format selection

Select an explicit format that the consumer can parse. Headerless tab-separated output requires separate column context.

| Format | Best For |
|--------|----------|
| `JSON` | Column metadata, row count, and statistics |
| `JSONCompact` | Similar metadata with rows as arrays |
| `JSONEachRow` | Streaming and line-oriented consumers |
| `TabSeparatedWithNames` | Compact tabular results with column names |

Use `JSON` as the default for agent work. Switch to `TabSeparatedWithNames` when result sets are large and context window budget matters.

Reference: [ClickHouse MCP Server](https://github.com/ClickHouse/mcp-clickhouse) · [clickhouse-client](https://clickhouse.com/docs/interfaces/cli) · [Output Formats](https://clickhouse.com/docs/interfaces/formats)
