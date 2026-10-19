---
title: Query ClickPipes Postgres CDC Tables as Versioned Rows
impact: HIGH
impactDescription: "Plain reads of CDC destination tables return every change, not the current Postgres state: counts, sums, and joins come out wrong"
tags: [query, clickpipes, cdc, postgres, ReplacingMergeTree, FINAL, peerdb]
---

## Query ClickPipes Postgres CDC Tables as Versioned Rows

**Impact: HIGH**

ClickPipes replicates each Postgres INSERT, UPDATE and DELETE as a new inserted row in a `ReplacingMergeTree` table. It adds three columns:

| Column | Type | Meaning |
|--------|------|---------|
| `_peerdb_version` | `Int64` | Version of the row; the engine's version column |
| `_peerdb_is_deleted` | `Int8` | `1` if this version is a Postgres DELETE |
| `_peerdb_synced_at` | `DateTime64(9) DEFAULT now64()` | When the version was written to ClickHouse |

The generated DDL is `ENGINE = ReplacingMergeTree(_peerdb_version)` with `ORDER BY` set to the Postgres primary key. `_peerdb_is_deleted` is an ordinary column, not the engine's `is_deleted` parameter, so `FINAL` keeps delete markers: test the flag on the deduplicated row (after `FINAL`, or in `HAVING` for `argMax` reads), never before deduplication. This rule covers what is specific to ClickPipes tables. Confirm the names with `SHOW CREATE TABLE`, because a table you created yourself may differ.

**Incorrect (plain reads count every version):**

```sql
-- Order 1 was inserted, then updated; order 2 was inserted, then deleted.
-- This counts three rows for one live order: both versions of order 1,
-- plus order 2 through its pre-delete version.
SELECT status, count() AS orders, sum(amount) AS revenue
FROM orders
WHERE _peerdb_is_deleted = 0
GROUP BY status;
```

**Correct (FINAL, then drop delete markers; FINAL on every CDC table in a join):**

```sql
SELECT status, count() AS orders, sum(amount) AS revenue
FROM orders FINAL
WHERE _peerdb_is_deleted = 0
GROUP BY status;

-- Joins: both sides are CDC tables, so both need deduplication.
-- SETTINGS final = 1 applies FINAL to every table in the query.
SELECT c.name, count() AS orders, sum(o.amount) AS revenue
FROM orders AS o
INNER JOIN customers AS c ON c.id = o.customer_id
WHERE o._peerdb_is_deleted = 0 AND c._peerdb_is_deleted = 0
GROUP BY c.name
SETTINGS final = 1;
```

To check that the pipe is in sync, compare Postgres `SELECT count(*)` with `SELECT count() FROM orders FINAL WHERE _peerdb_is_deleted = 0`, taken over the same window. To see when data last landed, `SELECT max(_peerdb_synced_at) FROM orders` gives the time the latest version was written to ClickHouse. It does not tell you how far the source has moved on since.

**Filter placement:**

- Put the delete filter in `WHERE`, not `PREWHERE`. On 25.3, an explicit `PREWHERE _peerdb_is_deleted = 0` on a `FINAL` query ran before deduplication, so a deleted row came back with its old values. Newer versions add `apply_prewhere_after_final` (default `0`).
- A row policy of the form `USING _peerdb_is_deleted = 0` (the deduplication docs suggest one) is only correct if it is applied after `FINAL`. Some recent versions applied such policies before `FINAL`. The `apply_row_policy_after_final` setting restores the after-`FINAL` behavior. It is on by default from 26.2 (and in later patch releases of some earlier versions); older versions may lack it or default it to `0`. Check `SELECT getSetting('apply_row_policy_after_final')` on your service before relying on a row policy for delete filtering.

**What the rows contain:**

- **Deletes.** By default Postgres sends only primary-key (replica identity) values for a DELETE, so the delete version has empty or default values in the other columns. Unfiltered queries show blank rows, and a non-key filter applied before deduplication can skip the delete version and resurrect the row.
- **TOAST columns.** Without `REPLICA IDENTITY FULL` on the Postgres table, a large (TOASTed) column that an UPDATE did not change arrives as NULL or empty, and so does every TOAST column on a DELETE. The fix is on the Postgres side (`ALTER TABLE ... REPLICA IDENTITY FULL`), and it increases WAL volume.
- **Primary-key updates.** Updating a Postgres primary key arrives as a row with a new key. The version under the old key is not superseded, so it stays live.

**ORDER BY is the deduplication key:**

- ClickPipes uses the Postgres primary key as `ORDER BY`. If you add columns to a custom ordering key, use only columns that never change for a row, and keep the primary key in the key. With a mutable column such as `status` in `ORDER BY`, each status change creates a separate key, so `FINAL` returns one row per status the order ever had.
- For a custom ordering key, the ClickPipes docs also require the Postgres `REPLICA IDENTITY` to include the ordering-key columns. Otherwise, deletes may not deduplicate against earlier versions.
- For analytical ordering that needs mutable columns, build a downstream table or a refreshable materialized view from the deduplicated data (`FINAL ... WHERE _peerdb_is_deleted = 0`).

**Materialized views see every version.** An incremental materialized view on a CDC table processes each inserted block, including updates and deletes. A view that sums `amount` counts updates again and never subtracts deletes (in a local test: 200 against a true total of 0 after insert, update and delete). Use a refreshable materialized view over the `FINAL` read, or version-aware aggregation.

Postgres-side troubleshooting (replication slots, WAL retention, publications) is outside this rule. Use the ClickPipes console and the Postgres docs for that.

Reference: [Deduplication strategies (using CDC)](https://clickhouse.com/docs/integrations/clickpipes/postgres/deduplication) · [Ordering keys](https://clickhouse.com/docs/integrations/clickpipes/postgres/ordering_keys) · [TOAST columns](https://clickhouse.com/docs/integrations/clickpipes/postgres/toast) · [ClickPipes for Postgres FAQ](https://clickhouse.com/docs/integrations/clickpipes/postgres/faq) · [apply_* settings](https://clickhouse.com/docs/reference/settings/session-settings/apply) · [FINAL setting](https://clickhouse.com/docs/reference/settings/session-settings/other#final)
