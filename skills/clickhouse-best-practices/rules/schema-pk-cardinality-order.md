---
title: Order Columns by Cardinality (Low to High)
impact: CRITICAL
impactDescription: "Key order affects pruning and compression; choose useful filter columns first"
tags: [schema, primary-key, cardinality, ORDER BY]
---

## Order Columns by Cardinality (Low to High)

**Impact: CRITICAL**

Since the sparse primary index operates on data blocks (granules) rather than individual rows, low-cardinality leading columns create more useful index entries that can skip entire blocks. Among columns useful to the workload, lower-cardinality columns often work well earlier. A high-cardinality leading key is appropriate for selective lookups on that key; cardinality alone does not determine pruning.

**Incorrect (high cardinality first):**

```sql
-- Poor fit when the workload filters event_type/time rather than event_id
CREATE TABLE events (event_id UUID, event_type LowCardinality(String), timestamp DateTime, event_date Date DEFAULT toDate(timestamp))
ENGINE = MergeTree()
ORDER BY (event_id, event_type, timestamp);
-- event_id lookups can prune well, but event_type/time filters may prune poorly
```

**Correct (low cardinality first):**

```sql
-- Low cardinality first enables pruning
CREATE TABLE events (event_id UUID, event_type LowCardinality(String), timestamp DateTime, event_date Date DEFAULT toDate(timestamp))
ENGINE = MergeTree()
ORDER BY (event_type, event_date, event_id);
-- Index can skip entire event_type groups
```

**Column Order Guidelines:**

| Position | Cardinality | Examples |
|----------|-------------|----------|
| 1st | Low (few distinct values) | event_type, status, country |
| 2nd | Date (coarse granularity) | toDate(timestamp) |
| 3rd+ | Medium-High | user_id, session_id |
| Last | High (if needed) | event_id, uuid |

**Tip:** Use `toDate(timestamp)` instead of raw `DateTime` columns when day-level filtering suffices - this reduces index size from 32-bit to 16-bit representations.

Reference: [Choosing a Primary Key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)
