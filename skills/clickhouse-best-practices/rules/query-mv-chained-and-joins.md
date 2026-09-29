---
title: Materialized Views Read the Inserted Block, Not the Table
impact: HIGH
impactDescription: "Chained views see unmerged rows; JOIN views miss right-table changes and re-read the right table on every insert"
tags: [query, materialized-view, cascading, JOIN, ReplacingMergeTree]
---

## Materialized Views Read the Inserted Block, Not the Table

**Impact: HIGH**

An incremental materialized view is an insert trigger. Its `FROM` table stands for the block being inserted right now, not for the table's contents. Two consequences are easy to miss:

- **Chained views.** In `source → mv1 → mid → mv2 → final`, `mv2` fires on the rows `mv1` writes into `mid`. It never sees `mid` after merges, so if `mid` is a `ReplacingMergeTree`, `SummingMergeTree` or `CollapsingMergeTree`, `mv2` receives every version, every partial sum and every cancel row.
- **Views with a JOIN.** Only inserts into the left-most table trigger the view. The right-hand table is read in full on every insert block, and inserts or updates to it do not trigger the view or change rows it already wrote.

**Incorrect (expecting a chained view to see deduplicated rows):**

```sql
-- orders_latest is a ReplacingMergeTree fed by another view.
-- This view fires on every version written to orders_latest,
-- so an order updated three times is counted three times.
CREATE MATERIALIZED VIEW orders_per_day_mv TO orders_per_day AS
SELECT toDate(created_at) AS day, count() AS orders
FROM orders_latest
GROUP BY day;
```

**Correct (keep aggregate states through the chain, or resolve versions at query time):**

```sql
-- Carry states that combine correctly regardless of merge timing,
-- e.g. uniqState over the order id instead of count() over versions.
CREATE MATERIALIZED VIEW orders_per_day_mv TO orders_per_day AS
SELECT toDate(created_at) AS day, uniqExactState(order_id) AS orders
FROM orders_latest
GROUP BY day;

SELECT day, uniqExactMerge(orders) AS orders
FROM orders_per_day
GROUP BY day;
```

This works because every version of an order carries the same `order_id` and `created_at`. If the grouping columns can change between versions, or the downstream result needs the latest value of a column, no incremental view can resolve that from blocks alone. Query the upstream table with `FINAL` or `argMax`, or use a refreshable view (see [query-mv-refreshable](query-mv-refreshable.md)).

**Incorrect (enrichment JOIN on a large or changing dimension):**

```sql
-- Fires on inserts into events only. Each insert block reads all of
-- users; a user inserted after their events leaves those rows with
-- default values (empty string) for good.
CREATE MATERIALIZED VIEW events_enriched_mv TO events_enriched AS
SELECT e.event_id AS event_id, e.user_id AS user_id, u.country AS country
FROM events AS e
LEFT JOIN users AS u ON e.user_id = u.user_id;
```

**Correct (dictionary lookup, or refreshable view when the dimension changes):**

```sql
-- A dictionary is held in memory and refreshed on its own schedule,
-- so the insert path does not scan the users table.
CREATE MATERIALIZED VIEW events_enriched_mv TO events_enriched AS
SELECT
    event_id,
    user_id,
    dictGet('users_dict', 'country', user_id) AS country
FROM events;
```

The dictionary lookup is still evaluated once, at insert time. If rows must reflect later changes to the dimension, join at query time or rebuild the result with a refreshable view. A JOIN inside an incremental view is reasonable when the right-hand table is small and effectively static; check its cost with `read_rows` per view in `system.query_views_log` (see [query-mv-insert-cost](query-mv-insert-cost.md)).

Reference: [Incremental materialized views: JOINs](https://clickhouse.com/docs/concepts/features/materialized-views/incremental-materialized-view#materialized-views-and-joins), [Cascading materialized views](https://clickhouse.com/docs/concepts/features/materialized-views/cascading-materialized-views), [CREATE VIEW](https://clickhouse.com/docs/reference/statements/create/view#materialized-view)
