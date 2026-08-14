---
title: Use FINAL or argMax to Deduplicate ReplacingMergeTree Reads
impact: CRITICAL
impactDescription: "Plain SELECT returns duplicate, stale, or deleted rows; naive dedup queries resurrect deleted rows"
tags: [query, ReplacingMergeTree, deduplication, FINAL, argMax, LIMIT BY, soft-delete]
---

## Use FINAL or argMax to Deduplicate ReplacingMergeTree Reads

**Impact: CRITICAL**

`ReplacingMergeTree` deduplicates asynchronously, only when parts merge. Until then a plain `SELECT` can return duplicate rows, outdated versions, and rows already marked deleted. Use one of the three patterns below. Note that row identity is the **`ORDER BY` tuple**, not `PRIMARY KEY` and not an `id` column — every pattern must key on that whole tuple.

**Incorrect (raw SELECT, no deduplication):**

```sql
-- Background merges may not have run yet: can return several
-- versions of the same row, including ones marked deleted.
SELECT * FROM rmt_table WHERE id = 42;
```

**Correct (FINAL — simplest, best when filtering on key columns):**

```sql
SELECT * FROM rmt_table FINAL
WHERE project_id = 42;
```

`FINAL` merges parts on the fly as the query runs. Filter on `ORDER BY` prefix columns where possible — it reduces the data fed into the on-the-fly merge. ClickHouse does not apply the `PREWHERE` optimization under `FINAL` for non-key filters.

Whether `FINAL` also drops delete-marked rows depends on the DDL. With `ReplacingMergeTree(ver, is_deleted)` the engine knows the delete column and `FINAL` removes those rows itself. If the delete flag is an ordinary column not declared as the second engine parameter — the shape CDC pipelines such as ClickPipes/PeerDB generate — you must filter it yourself. That filter is safe in a plain `WHERE` here, because `FINAL` has already resolved each key to its latest row:

```sql
SELECT * FROM rmt_table FINAL
WHERE project_id = 42 AND is_deleted = 0;
```

**Correct (GROUP BY + argMax — fastest for large aggregations):**

```sql
SELECT
    project_id, id,
    argMax(display_name, version) AS display_name,
    argMax(reputation, version) AS reputation
FROM users
GROUP BY project_id, id
HAVING argMax(is_deleted, version) = 0;
```

Best when you need only a few columns alongside the key. The delete filter must go in `HAVING`, evaluated over `argMax(is_deleted, version)`.

**Incorrect (WHERE on the delete flag resurrects deleted rows):**

```sql
-- WHERE strips the newest (deleted) row BEFORE aggregation,
-- so argMax falls back to an older active version.
SELECT
    id,
    argMax(display_name, version) AS display_name
FROM users
WHERE is_deleted = 0
GROUP BY id;
```

**Correct (ORDER BY + LIMIT 1 BY — wide rows without FINAL's overhead):**

```sql
SELECT * FROM (
    SELECT * FROM rmt_table
    ORDER BY version DESC
    LIMIT 1 BY project_id, created_at, id
)
WHERE is_deleted = 0;
```

Two hard requirements. The explicit `ORDER BY` is mandatory: row order is only guaranteed by an explicit `ORDER BY`, and without one multi-threaded execution returns unordered blocks, so `LIMIT BY` can keep a stale version. And `LIMIT BY` must key on the full `ORDER BY` tuple rather than a scalar `id`, unless that id is a globally unique application invariant — any omitted key component must be equality-filtered instead, or distinct rows collapse into one.

The delete filter belongs in an **outer** query. Placed in the same block it runs before `LIMIT BY` and keeps an older non-deleted row.

**Traps that apply to any version column:**

- **`argMax` skips NULLs.** If the newest row's value is NULL, `argMax` returns an older non-NULL value instead of NULL. For nullable columns wrap the argument as `argMax(tuple(col), version).1` — a tuple containing only NULL is not itself NULL, so the row is not skipped.
- **Ties are nondeterministic.** When several rows share the maximum version, which `arg` is returned is undefined, and separate `argMax` calls in one query can take fields from different rows. Use a strictly-increasing version, or a tuple tie-breaker: `argMax(col, (version, id))` and `ORDER BY version DESC, id DESC`.
- **Delete rows are never physically removed** by ordinary merges — only by `OPTIMIZE ... FINAL CLEANUP` with `allow_experimental_replacing_merge_with_cleanup=1`. The delete flag keeps mattering indefinitely.
- **`FINAL` is not `OPTIMIZE ... FINAL`.** The `SELECT` modifier is fine to use routinely; see `insert-optimize-avoid-final` for the table-rewrite operation.

**Choosing a pattern:**

| Situation | Use |
|---|---|
| Ad-hoc query, `SELECT *`, filtering on key columns | `FINAL` |
| Large aggregation, only a few columns needed | `GROUP BY` + `argMax` (delete filter in `HAVING`) |
| Full wide rows per key, avoiding `FINAL` overhead | `ORDER BY ... LIMIT 1 BY` (delete filter in an outer query) |

Reference: [ReplacingMergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree), [Replacing merges](https://clickhouse.com/docs/concepts/features/operations/update/replacing-merge-tree), [Deduplication strategies](https://clickhouse.com/docs/integrations/clickpipes/postgres/deduplication), [argMax](https://clickhouse.com/docs/reference/functions/aggregate-functions/argMax), [NULL processing](https://clickhouse.com/docs/reference/functions/aggregate-functions/index), [LIMIT BY Clause](https://clickhouse.com/docs/reference/statements/select/limit-by)
