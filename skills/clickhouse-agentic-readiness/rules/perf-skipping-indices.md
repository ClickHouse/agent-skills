---
title: Data Skipping Indices for Non-Key Columns
impact: MEDIUM
impactDescription: "Skipping indices extend fast filtering beyond ORDER BY columns — agents can filter on secondary columns without full scans"
tags: [perf, indices, skipping]
---

## Data Skipping Indices for Non-Key Columns

**Impact: MEDIUM** — Agents commonly filter on columns that aren't part of the ORDER BY key (e.g., filtering by `user_email` when the key is `(event_type, created_at)`). Data skipping indices (bloom_filter, set, minmax) allow ClickHouse to skip granules for these non-key filters, significantly improving query performance for exploratory agent queries.

**Diagnostic Query:**

```sql
-- Current skipping index inventory
SELECT
    database,
    table,
    name AS index_name,
    type AS index_type,
    expr AS index_expression,
    granularity
FROM system.data_skipping_indices
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
ORDER BY database, table, name;
```

```sql
-- Large tables without any skipping indices (potential improvement targets)
SELECT
    database,
    name,
    sorting_key,
    total_rows,
    formatReadableSize(total_bytes) AS size
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND engine LIKE '%MergeTree%'
  AND total_rows > 10000000
  AND name NOT IN (
    SELECT DISTINCT table FROM system.data_skipping_indices
    WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  )
ORDER BY total_rows DESC;
```

**Passing Condition:**
- Large tables have skipping indices on commonly filtered non-key columns
- Index types are appropriate (bloom_filter for equality, minmax for ranges, set for IN lists)

**Warning Condition:**
- Some indices exist but large tables with obvious secondary filter columns lack them

**Failing Condition:**
- No skipping indices on any table, especially on tables with >10M rows

**Remediation:**

```sql
-- Add bloom_filter for high-cardinality equality filters
ALTER TABLE db.events ADD INDEX idx_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- Add minmax for range filters
ALTER TABLE db.events ADD INDEX idx_amount amount TYPE minmax GRANULARITY 4;

-- Add set for IN-list filters on low-cardinality columns
ALTER TABLE db.events ADD INDEX idx_country country TYPE set(100) GRANULARITY 4;

-- Materialize index on existing data
ALTER TABLE db.events MATERIALIZE INDEX idx_user_id;
```

Reference: [Data Skipping Indices](https://clickhouse.com/docs/optimize/skipping-indexes)
