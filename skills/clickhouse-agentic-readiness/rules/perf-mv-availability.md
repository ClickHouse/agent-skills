---
title: Materialized Views for Common Query Patterns
impact: HIGH
impactDescription: "Materialized views reveal common query patterns and provide pre-aggregated paths — agents can use MVs for fast results instead of scanning raw tables"
tags: [perf, materialized-views, aggregation]
---

## Materialized Views for Common Query Patterns

**Impact: HIGH** — Materialized views serve a dual purpose for agents: (1) they provide pre-aggregated data for fast query execution, and (2) their definitions reveal which query patterns are common and important. An agent can read MV definitions to understand the business's key metrics and dimensions.

**Diagnostic Query:**

```sql
-- Materialized view inventory with definitions
SELECT
    database,
    name,
    as_select,
    engine
FROM system.tables
WHERE engine = 'MaterializedView'
  AND database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
ORDER BY database, name;
```

```sql
-- MV target tables (often AggregatingMergeTree or SummingMergeTree)
SELECT
    t.database,
    t.name,
    t.engine,
    t.sorting_key,
    t.total_rows,
    formatReadableSize(t.total_bytes) AS size,
    t.comment
FROM system.tables t
WHERE t.engine IN ('AggregatingMergeTree', 'SummingMergeTree')
  AND t.database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
ORDER BY t.database, t.name;
```

**Passing Condition:**
- Materialized views exist covering key aggregation patterns
- MV target tables have comments explaining what they pre-aggregate
- MVs cover the most queried dimensions (visible in system.query_log)

**Warning Condition:**
- Some MVs exist but lack comments, OR common query patterns from query_log have no corresponding MV

**Failing Condition:**
- No materialized views in the deployment

**Remediation:**

```sql
-- Create MVs for common agent query patterns
-- Example: Daily event counts by type
CREATE MATERIALIZED VIEW db.events_daily_mv
TO db.events_daily
AS SELECT
    toDate(created_at) AS date,
    event_type,
    count() AS event_count,
    uniq(user_id) AS unique_users
FROM db.events
GROUP BY date, event_type;

CREATE TABLE db.events_daily (
    date Date,
    event_type LowCardinality(String),
    event_count AggregateFunction(count),
    unique_users AggregateFunction(uniq, UInt64)
) ENGINE = AggregatingMergeTree()
ORDER BY (event_type, date)
COMMENT 'Pre-aggregated daily event counts by type. Source: db.events MV.';
```

Reference: [Materialized Views](https://clickhouse.com/docs/materialized-view)
