---
title: Keep ReplacingMergeTree Versions of a Key in One Partition
impact: HIGH
impactDescription: "Rows with the same key in different partitions are never deduplicated on disk; FINAL results depend on a setting"
tags: [query, ReplacingMergeTree, deduplication, partitioning, FINAL, version]
---

## Keep ReplacingMergeTree Versions of a Key in One Partition

**Impact: HIGH**

`ReplacingMergeTree` removes duplicates only when parts merge, and parts merge only within a partition. Two rows with the same `ORDER BY` key in different partitions stay on disk as two rows: background merges never combine them, and `OPTIMIZE TABLE ... FINAL` does not either. This happens whenever the partition key is computed from a column that changes between versions, such as partitioning by the month of `updated_at`.

`SELECT ... FINAL` still returns one row per key by default, because it merges across partitions at query time. With `do_not_merge_across_partitions_select_final = 1`, a setting often enabled to speed up `FINAL`, each partition is processed independently and both rows come back. `GROUP BY` + `argMax` reads are not affected by partitioning.

**Incorrect (partition key follows a column that changes on update):**

```sql
CREATE TABLE orders
(
    order_id UInt64,
    status LowCardinality(String),
    created_at DateTime,
    updated_at DateTime,
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(updated_at)
ORDER BY order_id;

-- An order created on 31 August and shipped on 1 September has one
-- row in each monthly partition. Both rows survive every merge.
SELECT order_id, status
FROM orders FINAL
WHERE order_id = 42
SETTINGS do_not_merge_across_partitions_select_final = 1;
-- Returns 2 rows.
```

**Correct (partition by a value that never changes for a key):**

```sql
CREATE TABLE orders
(
    order_id UInt64,
    status LowCardinality(String),
    created_at DateTime,
    updated_at DateTime,
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(created_at)
ORDER BY order_id;
```

Every version of an order now lands in the partition of its creation month, so merges and `FINAL` (with either setting) can collapse it. Many `ReplacingMergeTree` tables need no partitioning at all (see [schema-partition-start-without](schema-partition-start-without.md)).

**Check an existing table for keys split across partitions:**

```sql
SELECT order_id, uniqExact(_partition_id) AS partitions
FROM orders
WHERE created_at >= now() - INTERVAL 7 DAY
GROUP BY order_id
HAVING partitions > 1
LIMIT 20;
```

**Version semantics:** the highest `version` wins regardless of insert order; with equal or no versions, the last inserted row wins. With `ReplacingMergeTree(version, is_deleted)` a delete row is kept by default so a lower-version insert cannot resurrect the key. `OPTIMIZE ... FINAL` cannot fix keys split across partitions (see [insert-optimize-avoid-final](insert-optimize-avoid-final.md)).

Reference: [ReplacingMergeTree](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/replacingmergetree), [ReplacingMergeTree guide: partitions](https://clickhouse.com/docs/concepts/features/operations/update/replacing-merge-tree#exploiting-partitions-with-replacingmergetree)
