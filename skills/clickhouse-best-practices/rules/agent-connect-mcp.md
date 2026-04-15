---
title: Use MCP Server for AI Agent Integration
impact: HIGH
impactDescription: "MCP provides schema-aware, interactive access ideal for agent workflows"
tags: [agent, mcp, connectivity, setup]
---

## Use MCP Server for AI Agent Integration

**Impact: HIGH**

The Model Context Protocol (MCP) gives AI agents structured access to ClickHouse — schema discovery, query execution, and result parsing in one integration. Two options exist depending on your deployment.

**Option 1: Self-hosted `mcp-clickhouse`**

Install and configure the open-source MCP server locally:

```bash
pip install mcp-clickhouse
```

Required environment variables:

| Variable | Example | Notes |
|----------|---------|-------|
| `CLICKHOUSE_HOST` | `abc123.clickhouse.cloud` | Your ClickHouse hostname |
| `CLICKHOUSE_USER` | `default` | Database user |
| `CLICKHOUSE_PASSWORD` | `your-password` | Database password |
| `CLICKHOUSE_SECURE` | `true` | Always `true` for ClickHouse Cloud |

**Where to find these values (ClickHouse Cloud):**

1. Go to [console.clickhouse.cloud](https://console.clickhouse.cloud)
2. Click on your service
3. Click **Connect** in the left sidebar
4. The connection dialog shows your **hostname**, **port**, and **default user**
5. If you need to reset the password, click **Reset password** in the same dialog

For self-managed deployments, check your server's `config.xml` or ask your ClickHouse administrator.

Write access is disabled by default. To enable:

```bash
export CLICKHOUSE_ALLOW_WRITE_ACCESS=true
```

**Option 2: ClickHouse Cloud Remote MCP (read-only)**

For ClickHouse Cloud users, the hosted MCP server requires no installation:

```bash
claude mcp add --transport http clickhouse-cloud https://mcp.clickhouse.cloud/mcp
```

This uses OAuth for authentication and provides read-only access. No environment variables needed — authentication is handled through the browser.

**When to use MCP vs CLI:**

| Scenario | Recommended |
|----------|-------------|
| Interactive agent workflows (schema discovery, iterative analysis) | MCP |
| Batch operations, scripting, automation | CLI |
| Large result sets (>10K rows) | CLI with `--format JSON` |
| Agent needs column types and table metadata | MCP |

**Performance note:** MCP has per-call overhead (~200-500ms for connection setup). For queries returning large result sets, piping CLI output with `--format JSON` to the agent is faster. MCP shines in multi-step workflows where the agent needs to discover schema, refine queries, and iterate — the structured tool interface is worth the per-call cost.

Reference: [ClickHouse MCP Server](https://github.com/ClickHouse/mcp-clickhouse)
