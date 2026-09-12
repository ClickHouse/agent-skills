---
title: Keep Partition Cardinality Bounded
impact: HIGH
impactDescription: "Too many partitions cause part explosion and 'too many parts' errors"
tags: [schema, partitioning, parts]
---

## Keep Partition Cardinality Bounded

**Impact: HIGH**

Choose partition granularity from retention, insert volume, and part size; 100–1,000 is a rough upper-range heuristic, not a minimum or target. Too many distinct partition values create excessive data parts, eventually triggering "too many parts" errors. ClickHouse enforces limits via `max_parts_in_total` and `parts_to_throw_insert` settings.

**Incorrect (high cardinality partitioning):**

```sql
-- High cardinality = too many partitions
CREATE TABLE events (timestamp DateTime, user_id UInt64)
ENGINE = MergeTree()
PARTITION BY user_id  -- Millions of partitions!
ORDER BY (timestamp);

-- Daily partitions can grow unbounded over years
CREATE TABLE logs (timestamp DateTime, service String)
ENGINE = MergeTree()
PARTITION BY toDate(timestamp)  -- 3650 partitions over 10 years
ORDER BY (service, timestamp);
```

**Correct (bounded cardinality):**

```sql
-- Monthly partitions = 12 per year, bounded cardinality
CREATE TABLE events (
    timestamp DateTime,
    event_type LowCardinality(String),
    user_id UInt64
)
ENGINE = MergeTree()
PARTITION BY toStartOfMonth(timestamp)
ORDER BY (event_type, timestamp);
```

**Validation:**

```sql
-- Check partition count and health
SELECT
    partition,
    count() as parts,
    sum(rows) as rows,
    formatReadableSize(sum(bytes_on_disk)) as size
FROM system.parts
WHERE table = 'events' AND active
GROUP BY partition
ORDER BY partition;

-- Investigate many small parts and partitions relative to retention and volume
```

Reference: [Choosing a Partitioning Key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)
