---
title: Meaningful ORDER BY Key Design
impact: HIGH
impactDescription: "Well-designed ORDER BY enables granule skipping — agents that filter on key prefix columns get sub-second responses instead of full scans"
tags: [perf, orderby, primary-key]
---

## Meaningful ORDER BY Key Design

**Impact: HIGH** — ClickHouse's sparse index allows it to skip data granules when queries filter on ORDER BY prefix columns. Agent-generated queries that happen to align with the key get fast responses; those that don't require full table scans. The more thoughtful the key design, the more agent query patterns will naturally benefit.

**Diagnostic Query:**

```sql
SELECT
    database,
    name,
    engine,
    sorting_key,
    primary_key,
    total_rows,
    formatReadableSize(total_bytes) AS size
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND engine LIKE '%MergeTree%'
ORDER BY database, name;
```

```sql
-- Identify tables where ORDER BY might be suboptimal
-- (single high-cardinality column or no key at all)
SELECT
    database,
    name,
    sorting_key
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND engine LIKE '%MergeTree%'
  AND (sorting_key = '' OR sorting_key NOT LIKE '%,%')  -- empty or single-column key
  AND total_rows > 1000000  -- only flag for non-trivial tables
ORDER BY total_rows DESC;
```

**Passing Condition:**
- All MergeTree tables with >1M rows have multi-column ORDER BY keys
- Key columns follow low-to-high cardinality ordering
- Key includes commonly filtered columns (timestamps, categories)

**Warning Condition:**
- Some large tables have single-column ORDER BY, but it's a reasonable choice (e.g., time-series with `toStartOfHour(timestamp)`)

**Failing Condition:**
- Large tables with empty or poorly chosen ORDER BY (e.g., only a high-cardinality UUID)

**Remediation:**

ORDER BY is immutable after table creation. For existing tables:

```sql
-- Check current key effectiveness with a sample query
EXPLAIN indexes = 1
SELECT count() FROM db.events
WHERE event_type = 'click' AND created_at >= '2024-01-01';
-- Look for "Granules: X/Y" — if X ≈ Y, the key isn't helping

-- For new tables, design ORDER BY for agent query patterns:
CREATE TABLE db.events (
    event_type LowCardinality(String),
    created_at DateTime,
    user_id UInt64,
    event_data String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (event_type, toStartOfHour(created_at), user_id);
-- Low cardinality first → high cardinality last
```

Reference: [Primary Keys and Indexes](https://clickhouse.com/docs/optimize/sparse-primary-indexes)
