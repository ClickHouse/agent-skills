---
title: Verify That Indexes and Projections Are Actually Used
impact: HIGH
impactDescription: "An index or projection that exists but is not chosen reads every granule; EXPLAIN and query_log show which one happened"
tags: [query, index, projection, EXPLAIN, query_log, diagnostics]
---

## Verify That Indexes and Projections Are Actually Used

**Impact: HIGH**

A sort key, skip index, or projection being defined on a table does not mean a query uses it. Check the plan before you claim an improvement, and check the completed query afterwards. Duration alone is weak evidence because caches and concurrency also change it.

**Incorrect (assuming the index applies because the column is indexed):**

```sql
-- Table: ORDER BY (tenant_id, event_time),
--        INDEX idx_user user_id TYPE bloom_filter, PROJECTION by_user (... ORDER BY user_id)

-- A non-monotonic function on the key column: the primary key is not used
SELECT count() FROM events WHERE tenant_id % 10 = 2;

-- The skip index is defined on user_id, not on user_id + 1: the index is not used
SELECT sum(amount) FROM events WHERE user_id + 1 = 123457;
```

**Correct (read the plan, then the completed query):**

```sql
-- 1. Before running: which parts and granules each index keeps
EXPLAIN indexes = 1
SELECT sum(amount) FROM events WHERE tenant_id = 42;
-- PrimaryKey  Condition: (tenant_id in [42, 42])   Granules: 7/611   -> key used
-- PrimaryKey  Condition: true                      Granules: 611/611 -> key not used
-- Skip        Name: idx_user ... Granules: 22/611  -> skip index applied (absent = not applied)
-- ReadFromMergeTree (by_user)                      -> projection chosen instead of the table

-- 2. After running: what the query actually read
SELECT
    event_time,
    projections,
    read_rows,
    ProfileEvents['SelectedMarks'] AS marks_read,
    ProfileEvents['SelectedMarksTotal'] AS marks_total,
    query_duration_ms
FROM system.query_log
WHERE event_date >= today() - 1
  AND type = 'QueryFinish'
  AND has(tables, 'default.events')
ORDER BY event_time DESC
LIMIT 20;
```

`projections` lists the projections used, including the implicit `_minmax_count_projection`. `SelectedMarksTotal` needs 24.8 or later. In 24.x and 25.x, `system.query_log` has no column that lists the skip indexes used. For skip indexes, use EXPLAIN or the assertion settings below. On ClickHouse Cloud, read the log through `clusterAllReplicas('default', system.query_log)`. `EXPLAIN projections = 1` (25.6 and later) also lists projections that were analyzed but not chosen.

**Assertions for tests and CI:**

```sql
SELECT sum(amount) FROM events WHERE tenant_id = 42
SETTINGS force_primary_key = 1, optimize_use_projections = 0;

SELECT sum(amount) FROM events WHERE user_id = 123456
SETTINGS force_data_skipping_indices = 'idx_user', optimize_use_projections = 0;

SELECT sum(amount) FROM events WHERE user_id = 123456
SETTINGS force_optimize_projection_name = 'by_user';
```

A failed assertion throws `INDEX_NOT_USED` (277) or `PROJECTION_NOT_USED` (584) instead of running a full scan. These settings have two limits:
- They check that a usable condition exists, not that it prunes. `tenant_id >= 0` passes `force_primary_key` while reading every mark.
- They check every MergeTree read in the query. On 25.3, with a projection defined, `force_primary_key` rejected `tenant_id = 42` and named the projection's key, even though the table's own key pruned to 7/611 granules. Add `optimize_use_projections = 0` when you assert on the base table's key. See also [#116338](https://github.com/ClickHouse/ClickHouse/issues/116338) for queries that read more than one table.

**Reasons an index is not used (reproduced on 25.3):**

| Pattern | Result |
|---------|--------|
| Non-monotonic function on a key column (`tenant_id % 10`, `formatDateTime(event_time, ...)`, `if(...)`) | Primary key not used |
| Monotonic function (`toDate`, `toStartOfHour`, `toUnixTimestamp`) or a string literal compared with a numeric or DateTime key | Primary key still used |
| `OR` with a column outside the key (`tenant_id = 42 OR status = 'error'`) | Primary key not used |
| Skip-index expression differs from the filter (`user_id + 1 = ...` for an index on `user_id`) | Skip index not used |
| `SELECT ... FINAL` on a table with a projection | Projection not used on 25.3; test your version |
| Skip index with `FINAL` | Depends on `use_skip_indexes_if_final` (default 0 before 25.6, 1 from 25.6) |
| `count()`, `min()`, `max()` after a lightweight `DELETE` | Trivial count and `_minmax_count_projection` stop being used, even after `OPTIMIZE ... FINAL` on 25.3 ([#66699](https://github.com/ClickHouse/ClickHouse/issues/66699)) |

For filters that skip a leading key column, see [schema-pk-filter-on-orderby](schema-pk-filter-on-orderby.md). For when to add a skip index at all, see [query-index-skipping-indices](query-index-skipping-indices.md).

Reference: [EXPLAIN](https://clickhouse.com/docs/reference/statements/explain) · [force_* settings](https://clickhouse.com/docs/reference/settings/session-settings/force) · [system.query_log](https://clickhouse.com/docs/reference/system-tables/query_log)
