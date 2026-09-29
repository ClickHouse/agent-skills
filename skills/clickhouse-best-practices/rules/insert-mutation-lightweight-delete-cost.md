---
title: Account for the Read Cost of Lightweight DELETE Until Parts Merge
impact: MEDIUM
impactDescription: "Masked parts add a filter to every read and can turn metadata-only count() into a full scan"
tags: [insert, mutation, DELETE, lightweight-delete, count, _row_exists]
---

## Account for the Read Cost of Lightweight DELETE Until Parts Merge

**Impact: MEDIUM**

Lightweight `DELETE FROM` is cheaper to run than `ALTER TABLE ... DELETE` (see [insert-mutation-avoid-delete](insert-mutation-avoid-delete.md)), but the deleted rows stay on disk. ClickHouse writes a hidden `_row_exists` mask into affected parts and removes the rows only when those parts are later merged. Until then:

- Every query on a masked part also reads `_row_exists` and filters on it.
- `count()` without `WHERE`, and `min()`/`max()` of partition-key columns or the first sorting-key column, can no longer be answered from part metadata and read the column data instead. On 25.3, `SELECT count()` over 2M rows went from `read_rows = 1` to `read_rows = 2000000` after deleting 10 rows. Before 26.4, this lasted even after the masked parts merged away; in the 25.3 test it cleared only after `DETACH TABLE`/`ATTACH TABLE` ([#101212](https://github.com/ClickHouse/ClickHouse/pull/101212), [#66699](https://github.com/ClickHouse/ClickHouse/issues/66699)).
- `DELETE FROM` is itself a mutation. It queues behind any unfinished mutation, and by default (`lightweight_deletes_sync = 2`) the statement waits for it. See [insert-mutation-diagnose-stuck](insert-mutation-diagnose-stuck.md).
- In compact parts, the delete rewrites all columns, because they are stored in one file.

The logical delete does not tell you when the data leaves storage.

**Incorrect (assuming the DELETE is free once it returns):**

```sql
DELETE FROM events WHERE user_id = 42;

-- Expected to stay instant; on affected versions it now scans the table
SELECT count() FROM events;
```

**Correct (find masked parts and measure the effect):**

```sql
-- Active parts that still carry a delete mask
SELECT partition, name, rows, formatReadableSize(bytes_on_disk) AS size
FROM system.parts
WHERE active AND database = 'db' AND table = 'events' AND has_lightweight_delete
ORDER BY rows DESC
LIMIT 50;

-- Compare rows read by count() before and after a DELETE (tag the queries with log_comment)
SELECT event_time, log_comment, read_rows, formatReadableSize(read_bytes) AS read, query_duration_ms
FROM system.query_log
WHERE event_date >= today() - 1
  AND type = 'QueryFinish'
  AND log_comment IN ('count_before_delete', 'count_after_delete')
ORDER BY event_time
LIMIT 20;
```

`system.parts_columns WHERE column = '_row_exists'` gives the same list of parts. If masked parts linger, you can remove the deleted rows early with `ALTER TABLE events APPLY DELETED MASK [IN PARTITION ...]`. The table setting `min_age_to_force_merge_seconds` forces merges of old parts, but on 25.3 it did not rewrite a partition that is already a single part, so that part kept its mask. Both rewrite data: plan them like any other mutation and run them only with the table owner's approval. For frequent or bulk deletes, prefer the partition and engine alternatives in [insert-mutation-avoid-delete](insert-mutation-avoid-delete.md).

Reference: [Lightweight DELETE](https://clickhouse.com/docs/reference/statements/delete), [APPLY DELETED MASK](https://clickhouse.com/docs/reference/statements/alter/apply-deleted-mask)
