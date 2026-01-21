---
title: Use PREWHERE for Early Filtering
impact: CRITICAL
impactDescription: 10-100× query speedup
tags: clickhouse, query-optimization, prewhere, filtering
---

## Use PREWHERE for Early Filtering

PREWHERE is a ClickHouse-specific optimization that filters rows before reading all columns. When a query filters data based on a subset of columns, PREWHERE can dramatically reduce I/O by reading only the filtering columns first, then reading remaining columns only for rows that pass the filter.

ClickHouse's query optimizer automatically converts WHERE to PREWHERE in many cases, but explicit PREWHERE usage ensures the optimization is applied and makes the intent clear.

**Incorrect:**

```sql
-- Reading all columns before filtering
SELECT user_id, event_name, event_time, properties
FROM events
WHERE event_time >= '2024-01-01'
  AND event_name = 'page_view'
```

**Correct:**

```sql
-- Filter with PREWHERE first, then read remaining columns
SELECT user_id, event_name, event_time, properties
FROM events
PREWHERE event_time >= '2024-01-01'
  AND event_name = 'page_view'
```

**Why it matters:**

If the `events` table has many columns (e.g., 50+ columns) but the filter condition only uses `event_time` and `event_name`, PREWHERE will:
1. Read only `event_time` and `event_name` columns from disk
2. Apply the filter condition
3. Read remaining columns (`user_id`, `properties`, etc.) only for rows that passed the filter

If the filter eliminates 99% of rows, PREWHERE reduces I/O by ~50× (reading 2 columns for all rows + 50 columns for 1% of rows, vs. 50 columns for all rows).

**When to use PREWHERE:**

- Filter conditions use columns that are cheap to read (small data types, well-compressed)
- Filter conditions eliminate a large percentage of rows (>50%)
- Query selects many columns but filters on few columns
- Filtering columns are part of the primary key or sorting key

**When NOT to use PREWHERE:**

- Filter condition uses most or all of the selected columns (no I/O savings)
- Filter condition is very selective but uses expensive columns (large strings, complex types)
- ClickHouse's automatic optimization is already converting WHERE to PREWHERE (check with EXPLAIN)

**Checking optimization:**

```sql
EXPLAIN SELECT user_id, event_name, event_time, properties
FROM events
WHERE event_time >= '2024-01-01'
  AND event_name = 'page_view'
```

Look for "Prewhere" in the query plan to confirm the optimization is applied.

Reference: [ClickHouse PREWHERE Documentation](https://clickhouse.com/docs/en/sql-reference/statements/select/prewhere)
