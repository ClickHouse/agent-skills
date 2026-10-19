---
title: Verify TTL Deletion from Part Metadata, Not from Wall-Clock Time
impact: MEDIUM-HIGH
impactDescription: "Expired rows stay on disk and visible to queries until a TTL merge rewrites or drops their part"
tags: [schema, TTL, retention, merges, system.parts, part_log]
---

## Verify TTL Deletion from Part Metadata, Not from Wall-Clock Time

**Impact: MEDIUM-HIGH**

A `TTL ... DELETE` rule is not a scheduled delete. Expired rows are removed only when a background merge processes their part, and until then they are still returned by queries. Four things commonly make TTL look like it "isn't deleting":

- **`merge_with_ttl_timeout`**: after a TTL delete merge in a partition, ClickHouse waits this long (14400 s, or 4 hours, by default) before it runs another one in that partition. Rows that expire in between stay until the next TTL merge.
- **`ttl_only_drop_parts = 1`**: parts are never partially pruned, only dropped once every row has expired. This works when the partition key matches the retention unit (for example a daily partition with a daily TTL). If parts span long time ranges, nothing is removed until the newest row in the part expires.
- **`ALTER ... MODIFY TTL` with `materialize_ttl_after_modify = 0`**: existing parts get no TTL info and are not picked for TTL merges. With the default (`1`), the `ALTER` queues a `MATERIALIZE TTL` mutation that rewrites the affected parts. With `materialize_ttl_recalculate_only = 1`, that mutation only recalculates TTL info, and a later TTL merge does the deletion.
- **Merge capacity**: `max_number_of_merges_with_ttl_in_pool` caps how many TTL merges run at once, so on a busy server TTL work can lag.

**Incorrect (judging TTL by the data and the clock):**

```sql
-- Returns expired rows and concludes the TTL is broken
SELECT count() FROM events WHERE ts < now() - INTERVAL 30 DAY;

-- Forces a rewrite of the whole table to "fix" it
OPTIMIZE TABLE events FINAL;
```

**Correct (read each part's TTL range and the merge history):**

```sql
-- Parts holding expired rows; on a table that has a TTL, a zero (1970-01-01) range means the part has no TTL info
SELECT partition, name, rows, delete_ttl_info_min, delete_ttl_info_max,
       toUnixTimestamp(delete_ttl_info_max) = 0 AS no_ttl_info
FROM system.parts
WHERE active AND database = 'db' AND table = 'events'
  AND (delete_ttl_info_min <= now() OR toUnixTimestamp(delete_ttl_info_max) = 0)
ORDER BY delete_ttl_info_min
LIMIT 50;

-- Did TTL merges run, and when?
SELECT event_time, merge_reason, part_name, rows, duration_ms
FROM system.part_log
WHERE event_date >= today() - 7
  AND database = 'db' AND table = 'events'
  AND event_type = 'MergeParts'
  AND merge_reason IN ('TTLDeleteMerge', 'TTLRecompressMerge')
ORDER BY event_time DESC
LIMIT 50;
```

Match what you see to a cause. On a table that has a TTL, parts with `no_ttl_info = 1` after a `MODIFY TTL` need `ALTER TABLE events MATERIALIZE TTL`. It is a mutation that rewrites parts, so run it only with the table owner's approval. Recent `TTLDeleteMerge` entries on parts that still have expired rows point to `merge_with_ttl_timeout`. Under `ttl_only_drop_parts`, parts whose `delete_ttl_info_max` is still in the future point to the partition layout. Check the effective settings in `system.merge_tree_settings` and any overrides in `SHOW CREATE TABLE` before you change them. On ClickHouse Cloud, read `system.part_log` through `clusterAllReplicas('default', system.part_log)`.

Reference: [Manage data with TTL](https://clickhouse.com/docs/concepts/features/operations/delete/ttl), [MergeTree TTL](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/mergetree)
