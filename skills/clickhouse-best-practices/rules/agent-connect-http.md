---
title: Use HTTP Interface for Programmatic Access
impact: MEDIUM
impactDescription: "HTTP is universally available when MCP and CLI are not an option"
tags: [agent, http, api, connectivity]
---

## Use HTTP Interface for Programmatic Access

**Impact: MEDIUM**

When MCP and CLI are unavailable — lambda functions, webhooks, custom integrations — the HTTP interface provides universal access to ClickHouse.

**Basic URL format:**

```
https://<host>:8443/?user=<user>&password=<password>&database=<db>
```

For ClickHouse Cloud, port 8443 is the HTTPS endpoint. Self-managed defaults to 8123 (HTTP) or 8443 (HTTPS).

**curl example for agents:**

```bash
curl -s "https://abc123.clickhouse.cloud:8443/" \
  --data-binary "SELECT name, engine, total_rows FROM system.tables WHERE database = 'default' FORMAT JSON" \
  -H "X-ClickHouse-User: default" \
  -H "X-ClickHouse-Key: your-password"
```

**Authentication options:**

| Method | Example |
|--------|---------|
| URL params | `?user=default&password=secret` |
| HTTP headers | `X-ClickHouse-User` + `X-ClickHouse-Key` |
| HTTP Basic Auth | `-u default:secret` |

Headers are preferred — they keep credentials out of URL query strings and server logs.

**Settings via URL params:**

```bash
curl -s "https://abc123.clickhouse.cloud:8443/?max_execution_time=30&max_result_rows=10000" \
  --data-binary "SELECT * FROM events WHERE event_date = today() FORMAT JSON" \
  -H "X-ClickHouse-User: default" \
  -H "X-ClickHouse-Key: your-password"
```

**Database selection:**

```bash
# Via header
curl -s "https://abc123.clickhouse.cloud:8443/" \
  --data-binary "SELECT count() FROM events FORMAT JSON" \
  -H "X-ClickHouse-User: default" \
  -H "X-ClickHouse-Key: your-password" \
  -H "X-ClickHouse-Database: analytics"

# Via URL param
curl -s "https://abc123.clickhouse.cloud:8443/?database=analytics" \
  --data-binary "SELECT count() FROM events FORMAT JSON" \
  -H "X-ClickHouse-User: default" \
  -H "X-ClickHouse-Key: your-password"
```

**When to use HTTP:**

| Scenario | Recommended Interface |
|----------|----------------------|
| Lambda / serverless functions | HTTP |
| Webhook handlers | HTTP |
| Languages without a native client | HTTP |
| Interactive agent workflows | MCP |
| Batch operations from shell | CLI |

**Important:** Always append `FORMAT JSON` (or your preferred format) to the query body. Without it, ClickHouse returns `TabSeparated` by default, which is harder for agents to parse reliably.

Reference: [HTTP Interface](https://clickhouse.com/docs/interfaces/http)
