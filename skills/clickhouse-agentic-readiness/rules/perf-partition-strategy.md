---
title: Healthy Partition Strategy
impact: MEDIUM
impactDescription: "Appropriate partitioning enables time-range pruning for agent queries and prevents over-partitioning that degrades performance"
tags: [perf, partition, pruning]
---

## Healthy Partition Strategy

**Impact: MEDIUM** — Partition pruning is one of the most effective optimizations for agent-generated time-range queries (`WHERE date >= '2024-01-01'`). However, over-partitioning (>1000 partitions) causes excessive file handles and slow metadata operations. An agent benefits from predictable partition behavior.

**Diagnostic Query:**

```sql
-- Tables with partitioning and their partition counts
SELECT
    database,
    table,
    count() AS active_partitions,
    min(partition) AS oldest_partition,
    max(partition) AS newest_partition
FROM system.parts
WHERE active
  AND database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
GROUP BY database, table
HAVING active_partitions > 1
ORDER BY active_partitions DESC;
```

```sql
-- Table partition key definitions
SELECT
    database,
    name,
    partition_key,
    total_rows,
    formatReadableSize(total_bytes) AS size
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND engine LIKE '%MergeTree%'
  AND partition_key != ''
ORDER BY database, name;
```

**Passing Condition:**
- Partition counts are in the 10–1000 range per table
- Partition keys use time-based functions (toYYYYMM, toMonday, etc.)
- Large tables (>100M rows) have partitioning enabled

**Warning Condition:**
- Some tables have >500 partitions but <1000, OR very large tables lack partitioning

**Failing Condition:**
- Tables with >1000 active partitions (over-partitioned), OR partition keys on high-cardinality columns

**Remediation:**

```sql
-- Example: Monthly partitioning for time-series data
CREATE TABLE db.events (
    created_at DateTime,
    event_type LowCardinality(String),
    data String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)  -- ~12 partitions/year
ORDER BY (event_type, created_at);

-- If over-partitioned (e.g., daily partitions over years), consider:
-- Recreating with monthly partitions, or using TTL to drop old partitions
```

Reference: [Partitioning](https://clickhouse.com/docs/engines/table-engines/mergetree-family/custom-partitioning-key)
