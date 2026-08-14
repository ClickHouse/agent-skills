---
title: Use FINAL or argMax to Deduplicate ReplacingMergeTree Reads
impact: CRITICAL
impactDescription: "Plain SELECT can return duplicate, stale, or deleted rows; naive dedup queries can resurrect deleted rows"
tags: [query, ReplacingMergeTree, deduplication, FINAL, argMax, LIMIT BY, soft-delete]
---

## Use FINAL or argMax to Deduplicate ReplacingMergeTree Reads

**Impact: CRITICAL**

`ReplacingMergeTree` deduplicates rows asynchronously in the background, only when parts merge. A plain `SELECT` against the raw table can therefore temporarily return duplicate rows, outdated versions, or rows that were logically deleted. Always apply one of the three patterns below instead of querying the table directly — and when the table uses a soft-delete flag (e.g. `_is_deleted`), filter it out **after** the latest version has been resolved, never before, or you will resurrect stale active rows.

**Incorrect (raw SELECT, no deduplication):**

```sql
-- Background merges may not have run yet: this can return
-- multiple versions of the same row, including deleted ones.
SELECT * FROM rmt_table WHERE id = 42;
```

**Correct (Pattern 1, FINAL — updates only, no delete marker):**

```sql
SELECT *
FROM rmt_table FINAL;
```

`FINAL` forces ClickHouse to merge parts on the fly during query execution, resolving duplicates as the query runs. It's the simplest option for `SELECT *`-style reads, and performs best when the query also filters on `ORDER BY` (primary key) columns, since that limits how much data needs on-the-fly deduplication.

**Correct (Pattern 1, FINAL — with an `_is_deleted` flag):**

```sql
SELECT *
FROM rmt_table FINAL
WHERE _is_deleted = 0;
```

`FINAL` resolves each row to its latest version before other clauses run, so filtering `_is_deleted` in a normal `WHERE` clause is safe here — it evaluates against the already-deduplicated state, not the raw parts.

**Correct (Pattern 2, GROUP BY + argMax — updates only):**

```sql
SELECT
    id,
    argMax(display_name, version) AS display_name,
    argMax(reputation, version) AS reputation
FROM users
GROUP BY id;
```

`argMax(arg, val)` returns the value of `arg` at the row with the maximum `val` (the versioning column). Over large datasets this is often significantly faster than `FINAL`, especially when only a few columns are needed alongside the primary key.

**Incorrect (Pattern 2, GROUP BY + argMax — WHERE resurrects deleted rows):**

```sql
-- Filtering _is_deleted in WHERE removes the newest (deleted) row
-- BEFORE aggregation, so argMax falls back to an older active version.
SELECT
    id,
    argMax(display_name, version) AS display_name,
    argMax(reputation, version) AS reputation
FROM users
WHERE _is_deleted = 0
GROUP BY id;
```

**Correct (Pattern 2, GROUP BY + argMax + HAVING — with an `_is_deleted` flag):**

```sql
SELECT
    id,
    argMax(display_name, version) AS display_name,
    argMax(reputation, version) AS reputation
FROM users
GROUP BY id
HAVING argMax(_is_deleted, version) = 0;
```

Resolve the delete flag for the latest version inside the aggregation with `argMax(_is_deleted, version)`, and filter on that in `HAVING` — never in `WHERE`, which would discard the delete marker before it can be seen.

**Correct (Pattern 3, ORDER BY + LIMIT BY — updates only):**

```sql
SELECT *
FROM rmt_table
ORDER BY version DESC
LIMIT 1 BY id;
```

`LIMIT n BY expressions` returns the first `n` rows per distinct value of those expressions, fetching complete, wide rows without `FINAL`'s merge overhead. An explicit `ORDER BY ... DESC` on the version column is required — ClickHouse's multi-threaded execution processes row blocks out of order, so without it `LIMIT BY` can return a stale version instead of the latest one.

**Incorrect (Pattern 3, LIMIT BY combined with WHERE — resurrects deleted rows):**

```sql
-- WHERE in the same query block discards delete markers before
-- LIMIT BY can pick the latest row, surfacing an older active version.
SELECT *
FROM rmt_table
WHERE _is_deleted = 0
ORDER BY version DESC
LIMIT 1 BY id;
```

**Correct (Pattern 3, subquery — resolve latest version, then filter deleted rows):**

```sql
SELECT *
FROM (
    SELECT *
    FROM rmt_table
    ORDER BY version DESC
    LIMIT 1 BY id
)
WHERE _is_deleted = 0;
```

Resolve the latest row per key first, then filter out deleted rows in the outer query — filtering in the same block as `LIMIT BY` removes delete markers before deduplication happens.

**Choosing a pattern:**

| Situation | Use |
|---|---|
| Ad-hoc query, `SELECT *`, filtering on primary key | `FINAL` |
| Large-scale aggregation, only need a few columns | `GROUP BY` + `argMax` (soft-delete: filter in `HAVING`, not `WHERE`) |
| Need full wide rows for specific keys, avoiding `FINAL` overhead | `ORDER BY ... LIMIT 1 BY` (soft-delete: filter in an outer query, not the same block) |

Reference: [ReplacingMergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree), [argMax](https://clickhouse.com/docs/sql-reference/aggregate-functions/reference/argmax), [LIMIT BY Clause](https://clickhouse.com/docs/sql-reference/statements/select/limit-by)
