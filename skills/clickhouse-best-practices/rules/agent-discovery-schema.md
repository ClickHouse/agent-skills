---
title: Discover Schema Before Querying
impact: CRITICAL
impactDescription: "Skipping schema discovery leads to full scans, wrong columns, and wasted compute"
tags: [agent, schema, discovery, workflow]
---

## Discover Schema Before Querying

**Impact: CRITICAL**

ALWAYS start by understanding the schema. Never assume table or column names. Agents that skip schema discovery write queries that scan unnecessary data, use wrong column names, or miss the sort key — all of which burn compute and return bad results. The below queries are examples of how you access the schema for tables. Step 1 is a literal query. The rest are exemplars.

**Step 1: List databases**

```sql
SELECT name
FROM system.databases
WHERE name NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
ORDER BY name;
```

**Step 2: List tables with size context**

```sql
SELECT database, name, engine, total_rows,
       formatReadableSize(total_bytes) as size
FROM system.tables
WHERE database = 'analytics'
ORDER BY total_bytes DESC;
```

This tells you which tables are large (and therefore expensive to scan carelessly) and what engine each uses.

**Step 3: Get columns, types, and comments**

```sql
SELECT name, type, comment
FROM system.columns
WHERE database = 'analytics' AND table = 'events'
ORDER BY position;
```

**Column comments are critical.** If table creators have added `COMMENT` annotations to columns, they are invaluable for understanding semantics (e.g., distinguishing `user_id_hash` from `user_id`). MCP's `list_tables` tool returns column names and types but may not surface comments — always query `system.columns` directly when you need full context.

**Step 4: Understand the sort key**

```sql
SELECT sorting_key, primary_key, partition_key
FROM system.tables
WHERE database = 'analytics' AND table = 'events';
```

Filtering on suitable sort-key expressions can prune data granules. Filters on other columns may use secondary indexes or other access paths, so inspect those before estimating a scan.

**Step 5: Inspect secondary indexes and server version**

```sql
SELECT version();

SELECT name, type_full, expr, granularity
FROM system.data_skipping_indices
WHERE database = 'analytics' AND table = 'events';
```

Index metadata identifies possible access paths, not guaranteed efficiency. Check expression matching, predicate support, settings, data distribution, and existing-part coverage. `TYPE text` appears in this system table but stores posting-list row IDs; read `query-index-text-native`, `query-index-text-semantics`, and `query-index-text-plan` when it is present or text search is requested. A large text-index granularity does not imply only part-level filtering. Use SHOW CREATE TABLE to inspect the full definition, including tokenization and normalization.

**Step 6: Sample data**

```sql
SELECT *
FROM analytics.events
LIMIT 5;
```

A small sample reveals actual data patterns — date ranges, enum values, null frequency — that inform how to write correct `WHERE` clauses.

**Step 7: Verify query plan before execution**

Before running a potentially expensive query, use `EXPLAIN` to verify it will use indexes efficiently:

```sql
-- Check which indexes and projections will be used
EXPLAIN indexes = 1
SELECT event_type, count()
FROM analytics.events
WHERE event_date >= '2024-01-01'
  AND user_id = 'abc123'
GROUP BY event_type;
```

Look for:
- **Keys** section showing your sort key columns are being used for filtering
- **Parts** and **Granules** counts showing pruning at those levels
- **Skip** entries identifying secondary indexes
- For `TYPE text`, use `EXPLAIN PLAN actions = 1, indexes = 1` and inspect virtual text-index filters and residual predicates; granule counts alone do not establish direct read or the cost of reading text

For a quick cost estimate without running the query:

```sql
EXPLAIN ESTIMATE
SELECT * FROM analytics.events
WHERE event_date >= '2024-01-01' AND user_id = 'abc123';
```

This returns estimated rows and bytes to be read — if the numbers look unreasonably large, refine your filters before executing.

**Example full discovery workflow:**

```sql
-- 1. What databases exist?
SELECT name FROM system.databases
WHERE name NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA');

-- 2. What's in the target database?
SELECT name, engine, total_rows,
       formatReadableSize(total_bytes) as size
FROM system.tables
WHERE database = 'analytics'
ORDER BY total_bytes DESC;

-- 3. What columns does the main table have? (comments reveal semantics)
SELECT name, type, comment
FROM system.columns
WHERE database = 'analytics' AND table = 'events'
ORDER BY position;

-- 4. What's the sort key? (determines efficient filter columns)
SELECT sorting_key, primary_key, partition_key
FROM system.tables
WHERE database = 'analytics' AND table = 'events';

-- 5. What skipping indexes exist? (optimized non-key filters)
SELECT name, type_full, expr, granularity
FROM system.data_skipping_indices
WHERE database = 'analytics' AND table = 'events';

-- 6. What does the data look like?
SELECT * FROM analytics.events LIMIT 5;

-- 7. Verify the query plan before running
EXPLAIN indexes = 1
SELECT event_type, count()
FROM analytics.events
WHERE event_date >= '2024-01-01'
  AND user_id = 'abc123'
GROUP BY event_type;

-- 8. NOW execute the query with confidence:
SELECT event_type, count()
FROM analytics.events
WHERE event_date >= '2024-01-01'  -- partition key filter
  AND user_id = 'abc123'          -- sort key filter
GROUP BY event_type
ORDER BY count() DESC
LIMIT 100;
```

**Why each step matters:**

| Step | Skipping It Causes |
|------|-------------------|
| List databases | Querying wrong or nonexistent database |
| List tables | Missing the right table, querying the wrong one |
| Get columns + comments | Wrong column names, misunderstood semantics |
| Check sort key | Full table scans instead of index-pruned reads |
| Check skip indexes | Missing optimized filter paths on non-key columns |
| Sample data | Wrong assumptions about date ranges, nulls, enums |
| Verify EXPLAIN | Expensive queries that could have been caught before execution |

Reference: [System Tables](https://clickhouse.com/docs/operations/system-tables)
