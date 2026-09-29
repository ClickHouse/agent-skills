---
title: Diagnose TOO_MANY_PARTS Before Changing Thresholds
impact: HIGH
impactDescription: "Find whether part creation, partition fan-out, or stalled merges cause insert throttling; raising limits only hides it"
tags: [insert, parts, merges, TOO_MANY_PARTS, part_log, diagnostics]
---

## Diagnose TOO_MANY_PARTS Before Changing Thresholds

**Impact: HIGH**

MergeTree throttles inserts when a partition has too many active parts. At `parts_to_delay_insert` it logs `Delaying inserting block by N ms` and counts `DelayedInserts`. At `parts_to_throw_insert` it fails with `TOO_MANY_PARTS` (code 252). The check uses the **busiest partition in the table**: on 25.3, once one partition reached the limit, inserts into a different partition of the same table were rejected too. The check is skipped when that partition's average part size exceeds `max_avg_part_size_for_too_many_parts`.

The same error code has other causes. Read the message:

| Message | Limit | Usual cause |
|---|---|---|
| `Too many parts (N with average size of ...)` | `parts_to_throw_insert` | Parts are created faster than they merge |
| `Too many parts (N) in all partitions in total` | `max_parts_in_total` | Too many partitions |
| `Too many partitions for single INSERT block` | `max_partitions_per_insert_block` | One INSERT spans many partitions |

**Incorrect (reading only server defaults, then raising the limit):**

```sql
-- Shows server-level defaults, not per-table SETTINGS overrides
SELECT name, value FROM system.merge_tree_settings
WHERE name IN ('parts_to_delay_insert', 'parts_to_throw_insert');

-- Treats the symptom; merge debt keeps growing
ALTER TABLE events MODIFY SETTING parts_to_throw_insert = 10000;
```

**Correct (find the partition, the creation rate, and merge progress):**

```sql
-- 1. Which partitions are near the limit, and are the parts unmerged (level 0)?
SELECT database, table, partition_id, count() AS active_parts,
       countIf(level = 0) AS unmerged_parts,
       formatReadableSize(median(bytes_on_disk)) AS median_part_size
FROM system.parts
WHERE active
GROUP BY database, table, partition_id
ORDER BY active_parts DESC
LIMIT 20;

-- 2. New parts per minute and their size, compared with merges and failures.
-- event_type is an Enum, so string comparison is correct
SELECT toStartOfMinute(event_time) AS minute,
       countIf(event_type = 'NewPart') AS new_parts,
       round(avgIf(rows, event_type = 'NewPart')) AS avg_rows_per_new_part,
       countIf(event_type = 'MergeParts') AS merges,
       countIf(error != 0) AS failed_events
FROM clusterAllReplicas('default', system.part_log)
WHERE event_date >= today() - 1 AND event_time > now() - INTERVAL 3 HOUR
  AND database = 'default' AND table = 'events'
GROUP BY minute
ORDER BY minute DESC
LIMIT 180;

-- 3. Inserts that fan out over many partitions
SELECT query_id, count() AS parts_written, uniqExact(partition_id) AS partitions
FROM clusterAllReplicas('default', system.part_log)
WHERE event_date >= today() - 1 AND event_time > now() - INTERVAL 1 HOUR
  AND event_type = 'NewPart' AND database = 'default' AND table = 'events'
GROUP BY query_id
ORDER BY partitions DESC
LIMIT 20;

-- 4. Merges running now: long, stuck, or none at all
SELECT hostName() AS host, table, round(elapsed) AS elapsed_s,
       round(progress, 2) AS progress, num_parts, is_mutation,
       formatReadableSize(total_size_bytes_compressed) AS size
FROM clusterAllReplicas('default', system.merges)
WHERE database = 'default'
ORDER BY elapsed DESC
LIMIT 20;

-- 5. Effective per-table overrides
SELECT name, extract(engine_full, 'SETTINGS (.*)$') AS table_settings
FROM system.tables
WHERE database = 'default' AND name = 'events';
```

How to read the results:
- **Many small `NewPart` rows per minute, with merges running:** part creation outpaces merging. Batch larger ([insert-batch-size](insert-batch-size.md)) or use async inserts ([insert-async-small-batches](insert-async-small-batches.md)).
- **Each insert writes one part per partition, across many partitions:** the partition key is too fine for the insert pattern ([schema-partition-low-cardinality](schema-partition-low-cardinality.md)).
- **Parts accumulate while `system.merges` is empty or shows one long merge:** this does not by itself mean merges have stopped. Look for failing merges (`error != 0` and `exception` in `part_log`), and a long-running merge or mutation holding the pool, before restarting or changing merge settings.
- **One replica has far more `NewPart` events or fewer merges:** group queries 2 and 4 by `hostName()` to compare replicas (see [agent-system-tables-read-safely](agent-system-tables-read-safely.md) for checking replica coverage). On a sharded cluster, also check whether inserts reach every shard evenly.

If the owner approves temporarily raising a threshold to keep ingestion running, record the old value and the condition for restoring it.

Reference: [Too many parts](https://clickhouse.com/docs/resources/support-center/knowledge-base/troubleshooting/exception-too-many-parts)
