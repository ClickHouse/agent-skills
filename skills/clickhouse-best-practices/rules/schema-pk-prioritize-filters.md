---
title: Prioritize Filter Columns in ORDER BY
impact: CRITICAL
impactDescription: "Align primary keys with important filters to reduce scanned granules"
tags: [schema, primary-key, WHERE, filtering]
---

## Prioritize Filter Columns in ORDER BY

**Impact: CRITICAL**

Prioritize columns frequently used in query filters (WHERE clause), especially those that exclude large numbers of rows. Filters outside the primary key may still use partition pruning, skipping indexes, or projections; inspect the actual plan.

**Incorrect (ORDER BY doesn't match query patterns):**

```sql
-- If most queries filter by tenant_id:
CREATE TABLE events (event_id UUID, tenant_id UInt64, event_date Date)
ENGINE = MergeTree()
ORDER BY (event_id);  -- Queries by tenant_id will full-scan!
```

**Correct (ORDER BY matches filter patterns):**

```sql
-- ORDER BY matches query filter patterns
CREATE TABLE events (event_id UUID, tenant_id UInt64, event_date Date)
ENGINE = MergeTree()
ORDER BY (tenant_id, event_date, event_id);

-- Query now uses primary index:
SELECT * FROM events WHERE tenant_id = 123 AND event_date >= '2024-01-01';
```

**Validation:**

```sql
-- Verify index usage
EXPLAIN indexes = 1
SELECT * FROM events WHERE tenant_id = 123;
-- Look for "PrimaryKey" with Key Condition
```

Reference: [Choosing a Primary Key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)
