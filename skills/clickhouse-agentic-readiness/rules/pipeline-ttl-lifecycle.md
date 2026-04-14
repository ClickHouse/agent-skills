---
title: TTL Policies for Data Lifecycle
impact: LOW
impactDescription: "TTL policies communicate data retention to agents — preventing queries over expired or soon-to-be-deleted data ranges"
tags: [pipeline, ttl, lifecycle]
---

## TTL Policies for Data Lifecycle

**Impact: LOW** — TTL (Time-To-Live) policies automatically manage data lifecycle by deleting or moving old data. For agents, TTL policies communicate retention boundaries: an agent querying a table with `TTL created_at + INTERVAL 90 DAY` knows not to analyze data older than 90 days and can communicate this limitation in its analysis.

**Diagnostic Query:**

```sql
-- Find tables with TTL policies
SELECT
    database,
    name,
    engine,
    create_table_query
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND engine LIKE '%MergeTree%'
  AND create_table_query LIKE '%TTL%'
ORDER BY database, name;
```

```sql
-- Large time-series tables without TTL (potential candidates)
SELECT
    t.database,
    t.name,
    t.sorting_key,
    t.partition_key,
    t.total_rows,
    formatReadableSize(t.total_bytes) AS size
FROM system.tables t
WHERE t.database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND t.engine LIKE '%MergeTree%'
  AND t.total_rows > 100000000
  AND t.create_table_query NOT LIKE '%TTL%'
  AND (t.sorting_key LIKE '%date%' OR t.sorting_key LIKE '%time%'
       OR t.partition_key LIKE '%toYYYY%' OR t.partition_key LIKE '%toMonth%')
ORDER BY t.total_rows DESC;
```

**Passing Condition:**
- Time-series tables with >100M rows have TTL policies matching business retention requirements
- TTL policies are consistent with table comments about data lifecycle

**Warning Condition:**
- No TTL policies but table comments document retention expectations, OR static/dimension tables correctly lack TTL

**Failing Condition:**
- Large time-series tables with no TTL and no documentation about retention

**Remediation:**

```sql
-- Add TTL to manage data lifecycle
ALTER TABLE db.events MODIFY TTL created_at + INTERVAL 90 DAY;

-- TTL with tiered storage (move to cold storage before deletion)
ALTER TABLE db.events MODIFY TTL
    created_at + INTERVAL 30 DAY TO VOLUME 'cold',
    created_at + INTERVAL 365 DAY DELETE;

-- Document retention in table comment
ALTER TABLE db.events MODIFY COMMENT 'Clickstream events. Retention: 90 days hot, 365 days cold, then deleted.';
```

Reference: [TTL](https://clickhouse.com/docs/sql-reference/statements/alter/ttl)
