---
title: Regular Insert Activity and Data Freshness
impact: MEDIUM
impactDescription: "Stale data degrades agent analysis quality — agents should know when data was last updated to qualify their findings"
tags: [pipeline, inserts, freshness]
---

## Regular Insert Activity and Data Freshness

**Impact: MEDIUM** — An agent analyzing data that hasn't been updated in weeks may produce misleading conclusions. Understanding data freshness lets an agent qualify its analysis ("based on data through 2024-03-15") and flag potentially stale tables.

**Diagnostic Query:**

```sql
-- Last modification time per table
SELECT
    database,
    table,
    max(modification_time) AS last_modified,
    dateDiff('day', max(modification_time), now()) AS days_since_update,
    count() AS active_parts,
    sum(rows) AS total_rows,
    formatReadableSize(sum(bytes_on_disk)) AS size
FROM system.parts
WHERE active
  AND database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
GROUP BY database, table
ORDER BY last_modified ASC;
```

```sql
-- Recent insert activity from query_log (if available)
SELECT
    databases,
    tables,
    count() AS insert_count,
    max(event_time) AS last_insert
FROM system.query_log
WHERE type = 'QueryFinish'
  AND query_kind = 'Insert'
  AND event_time >= now() - INTERVAL 7 DAY
GROUP BY databases, tables
ORDER BY last_insert DESC;
```

**Passing Condition:**
- Active tables show modification times within their expected refresh SLA
- No tables appear abandoned (last update >30 days ago without TTL/archival explanation)

**Warning Condition:**
- Some tables haven't been updated recently but may be static reference data (dictionaries, dimension tables)

**Failing Condition:**
- Multiple tables with no recent activity and no indication they're static reference data

**Remediation:**

Data freshness is a pipeline concern, not a schema fix. However, metadata can help:

```sql
-- Add comments indicating expected refresh cadence
ALTER TABLE db.events MODIFY COMMENT 'Clickstream events. Refresh: continuous (< 1 min lag). Source: Kafka.';
ALTER TABLE db.dim_products MODIFY COMMENT 'Product catalog. Refresh: daily at 02:00 UTC. Source: PostgreSQL CDC.';
ALTER TABLE db.country_codes MODIFY COMMENT 'Static reference table. No regular updates expected.';
```

Reference: [system.parts](https://clickhouse.com/docs/operations/system-tables/parts)
