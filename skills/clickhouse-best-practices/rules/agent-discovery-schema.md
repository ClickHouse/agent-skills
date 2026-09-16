---
title: Discover Relevant Schema Before Querying
impact: CRITICAL
impactDescription: "Use verified metadata to avoid wrong columns, misunderstood semantics, and unnecessary scans"
tags: [agent, schema, discovery, workflow]
---

## Discover Relevant Schema Before Querying

**Impact: CRITICAL**

Use schema supplied by the user, reliable session evidence, or target-database metadata. Retrieve what is missing for the task; there is no mandatory discovery sequence. A question about supplied SQL need not establish a live connection, and a known table need not trigger a database-wide inventory.

**Incorrect (guessing unknown columns):**

```sql
-- Assuming a timestamp column exists without checking the supplied schema
SELECT timestamp FROM analytics.events LIMIT 5;
```

**Correct (inspect the relevant table when its schema is unknown):**

```sql
SELECT name, type, comment
FROM system.columns
WHERE database = 'analytics' AND table = 'events'
ORDER BY position;

SELECT engine, sorting_key, primary_key, partition_key
FROM system.tables
WHERE database = 'analytics' AND name = 'events';
```

Comments help distinguish similarly named identifiers and units. Use SHOW CREATE TABLE when engine arguments, projections, defaults, or full DDL matter. Tools may already return this information; do not repeat equivalent calls.

**Example (find a table when the target is unknown):**

```sql
SELECT database, name, engine, total_rows, total_bytes
FROM system.tables
WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
ORDER BY total_bytes DESC
LIMIT 100;
```

**Example (inspect skipping indexes for a performance question):**

```sql
SELECT name, type_full, expr, granularity
FROM system.data_skipping_indices
WHERE database = 'analytics' AND table = 'events';
```

An index's presence does not prove a filter is selective. Inspect its use and granules pruned with EXPLAIN. Use a small, bounded sample only when values are needed to resolve semantics; five rows cannot establish overall cardinality, date range, or null frequency.

**Example (inspect a potentially expensive query before executing):**

```sql
EXPLAIN indexes = 1
SELECT event_type, count()
FROM analytics.events
WHERE event_date >= '2024-01-01' AND user_id = 'abc123'
GROUP BY event_type;
```

Adapt identifiers and literal types to the verified schema. Inspect parts and granules selected, primary-key conditions, skipping indexes, and projections. Later-key filters may still prune; non-key filters may benefit from other access paths. If the plan is expensive, propose an equivalent optimization or discuss a narrower question rather than silently changing the result scope.

Reference: [System Tables](https://clickhouse.com/docs/operations/system-tables) · [EXPLAIN](https://clickhouse.com/docs/sql-reference/statements/explain)
