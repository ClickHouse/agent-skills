---
title: Apply Safety Limits to Agent-Generated Queries
impact: CRITICAL
impactDescription: "Unbounded agent queries can scan billions of rows and saturate cluster resources"
tags: [agent, safety, limits, timeout]
recommended_models:
  min: "sonnet / gemini-pro / gpt-4o"
  note: "Needs to reason about filter selectivity and progressive exploration strategy."
---

## Apply Safety Limits to Agent-Generated Queries

**Impact: CRITICAL**

Every agent-generated query must have explicit safety limits. A single unbounded query can scan billions of rows, consume all memory, or run for minutes.

**Non-negotiable rules:**

- ALWAYS use `LIMIT` (default `LIMIT 1000`)
- ALWAYS set `max_execution_time` (default 30 seconds)
- NEVER run `SELECT *` on large tables without `LIMIT`
- NEVER query without filtering on sort key or partition key columns

**Incorrect:**

```sql
SELECT * FROM events WHERE user_id = '123'
```

**Correct:**

```sql
SELECT *
FROM events
WHERE event_date >= today() - 7 AND user_id = '123'
LIMIT 100
SETTINGS max_execution_time = 30
```

**Safety settings reference:**

| Setting | Default | Effect |
|---------|---------|--------|
| `max_execution_time` | 30 | Kills query after N seconds |
| `max_result_rows` | 10000 | Caps output rows |
| `result_overflow_mode` | `'break'` | Truncates instead of erroring |

**Progressive exploration pattern:**

Start narrow, widen only if needed:

```sql
-- 1. Count first (cheap)
SELECT count() FROM events WHERE event_date = today();

-- 2. Small sample (if count is reasonable)
SELECT * FROM events WHERE event_date = today() LIMIT 10;

-- 3. Full query with LIMIT
SELECT user_id, count() as events
FROM events
WHERE event_date = today()
GROUP BY user_id
ORDER BY events DESC
LIMIT 100
SETTINGS max_execution_time = 30;
```

Reference: [Query Settings](https://clickhouse.com/docs/operations/settings/query-level)
