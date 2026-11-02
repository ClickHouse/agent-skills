---
title: Choose an Aggregating Target Engine for GROUP BY Materialized Views
impact: CRITICAL
impactDescription: "A ReplacingMergeTree target silently discards partial aggregates; a plain MergeTree target returns one partial row per insert block"
tags: [query, materialized-view, aggregation, SummingMergeTree, AggregatingMergeTree, ReplacingMergeTree]
---

## Choose an Aggregating Target Engine for GROUP BY Materialized Views

**Impact: CRITICAL**

An incremental materialized view runs its `SELECT` on each inserted block, not on the whole source table, so `GROUP BY` produces one partial row per key **per block**. Separate INSERTs are separate blocks, and one large INSERT can also be split into several blocks. Nothing combines those partial rows unless the target engine does:

| Target engine | What happens to partial rows for one key |
|---|---|
| `MergeTree` | All kept. Correct only if every query re-aggregates. |
| `ReplacingMergeTree` | Merges keep one partial row and **discard the rest**. The data is lost, and re-aggregating afterwards cannot recover it. |
| `SummingMergeTree` | Numeric columns are summed at merge time. Correct for additive values, if queries still re-aggregate. |
| `AggregatingMergeTree` | Aggregate states are combined. Correct for any aggregate with `-State` / `-Merge`. |

**Incorrect (ReplacingMergeTree target for a GROUP BY view):**

```sql
CREATE TABLE user_totals (user_id UInt64, total UInt64, orders UInt64)
ENGINE = ReplacingMergeTree
ORDER BY user_id;

CREATE MATERIALIZED VIEW user_totals_mv TO user_totals AS
SELECT user_id, sum(amount) AS total, count() AS orders
FROM orders
GROUP BY user_id;

-- Three INSERTs for user 1 with amounts 10, 5 and 7 write three partial rows.
-- After a merge (or with FINAL) only the last one survives: total = 7, not 22.
SELECT user_id, total FROM user_totals FINAL WHERE user_id = 1;
```

Before merges run, `sum(total)` over this table still looks right, so the loss often appears later.

**Correct (SummingMergeTree for additive values, re-aggregated at query time):**

```sql
CREATE TABLE user_totals (user_id UInt64, total UInt64, orders UInt64)
ENGINE = SummingMergeTree
ORDER BY user_id;

CREATE MATERIALIZED VIEW user_totals_mv TO user_totals AS
SELECT user_id, sum(amount) AS total, count() AS orders
FROM orders
GROUP BY user_id;

-- Rows not yet merged are still partial, so aggregate again.
SELECT user_id, sum(total) AS total, sum(orders) AS orders
FROM user_totals
WHERE user_id = 1
GROUP BY user_id;
```

`SummingMergeTree` sums every numeric column outside the sorting key unless you list the columns to sum, and rows whose summed columns are all zero can disappear during merges.

**Correct (AggregatingMergeTree for non-additive aggregates):**

```sql
CREATE TABLE user_stats (
    user_id UInt64,
    total SimpleAggregateFunction(sum, UInt64),
    max_amount SimpleAggregateFunction(max, UInt64),
    buyers AggregateFunction(uniq, UInt64)
)
ENGINE = AggregatingMergeTree
ORDER BY user_id;

CREATE MATERIALIZED VIEW user_stats_mv TO user_stats AS
SELECT user_id, sum(amount) AS total, max(amount) AS max_amount, uniqState(buyer_id) AS buyers
FROM orders
GROUP BY user_id;

SELECT user_id, sum(total) AS total, max(max_amount) AS max_amount, uniqMerge(buyers) AS buyers
FROM user_stats
GROUP BY user_id;
```

`SimpleAggregateFunction` columns take the plain function in the view and in the query; `AggregateFunction` columns take `-State` in the view and `-Merge` in the query. Keep the view's `GROUP BY` consistent with the target's `ORDER BY`, because that key is what merges combine on. To check an existing view, compare a source aggregate with the target's re-aggregated value for a sample of keys over a closed time window.

Reference: [Incremental materialized views](https://clickhouse.com/docs/concepts/features/materialized-views/incremental-materialized-view), [CREATE VIEW](https://clickhouse.com/docs/reference/statements/create/view#materialized-view), [SummingMergeTree](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/summingmergetree), [AggregatingMergeTree](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/aggregatingmergetree)
