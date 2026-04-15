---
title: Apply Safety Limits to Agent-Generated Queries
impact: CRITICAL
impactDescription: "Unbounded agent queries can scan billions of rows and saturate cluster resources"
tags: [agent, safety, limits, timeout]
---

## Apply Safety Limits to Agent-Generated Queries

**Impact: CRITICAL**

Agents generate queries programmatically, often in loops. A single unbounded query can scan billions of rows, consume all available memory, or run for minutes. Every agent-generated query must have explicit safety limits.

**Non-negotiable rules:**

- ALWAYS use `LIMIT` on `SELECT` queries (default to `LIMIT 1000` unless the user requests more)
- ALWAYS set `max_execution_time` (30 seconds is a good default for interactive queries)
- NEVER run `SELECT *` on large tables without `LIMIT`
- NEVER run queries without filtering on sort key columns when possible

**Incorrect (unbounded query):**

```sql
-- No LIMIT, no time filter — might scan the entire table
SELECT * FROM events WHERE user_id = '123'
```

**Correct (bounded query with safety limits):**

```sql
SELECT *
FROM events
WHERE event_date >= today() - 7
  AND user_id = '123'
LIMIT 100
SETTINGS max_execution_time = 30
```

**Per-query safety settings:**

```sql
SELECT *
FROM events
WHERE event_date >= today() - 30
LIMIT 1000
SETTINGS
  max_execution_time = 30,
  max_result_rows = 10000,
  result_overflow_mode = 'break'
```

| Setting | Default for Agents | Effect |
|---------|-------------------|--------|
| `max_execution_time` | 30 | Kills query after N seconds |
| `max_result_rows` | 10000 | Caps output rows |
| `result_overflow_mode` | `'break'` | Truncates instead of erroring when limit is hit |

**Use `EXPLAIN` before expensive queries:**

```sql
-- Check how much data a query will read before running it
EXPLAIN ESTIMATE
SELECT user_id, count()
FROM events
WHERE event_date >= '2024-01-01'
GROUP BY user_id;
```

**Check query performance after execution:**

```sql
SELECT
    query_duration_ms,
    read_rows,
    formatReadableSize(read_bytes) as data_read,
    result_rows
FROM system.query_log
WHERE query_id = '{query_id}'
  AND type = 'QueryFinish'
ORDER BY event_time DESC
LIMIT 1;
```

If `read_rows` is in the billions or `query_duration_ms` exceeds a few seconds, the query needs tighter filters or a different approach.

**Progressive exploration pattern:**

Agents should start narrow and widen only if needed:

```sql
-- Step 1: Count first (cheap)
SELECT count() FROM events WHERE event_date = today();

-- Step 2: Small sample (if count is reasonable)
SELECT * FROM events WHERE event_date = today() LIMIT 10;

-- Step 3: Full query with LIMIT
SELECT user_id, count() as events
FROM events
WHERE event_date = today()
GROUP BY user_id
ORDER BY events DESC
LIMIT 100
SETTINGS max_execution_time = 30;
```

Reference: [Query Settings](https://clickhouse.com/docs/operations/settings/query-level)
