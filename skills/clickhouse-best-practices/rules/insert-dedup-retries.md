---
title: Retry Failed Inserts With the Same Data, Settings, and Token
impact: HIGH
impactDescription: "Block deduplication makes retries safe, but rebatched retries duplicate rows and identical new batches are silently dropped"
tags: [insert, deduplication, retries, insert_deduplication_token, materialized-views]
---

## Retry Failed Inserts With the Same Data, Settings, and Token

**Impact: HIGH**

When an INSERT times out or the connection drops, you cannot tell whether it was written. ClickHouse makes the retry safe by hashing each inserted block into a `block_id` and skipping any block whose ID is already in the table's deduplication log. A skipped block still returns success.

What is deduplicated depends on the table and the version:

- `ReplicatedMergeTree` keeps a log of recent block IDs by default, bounded by `replicated_deduplication_window` and `replicated_deduplication_window_seconds`. Both defaults changed recently (to 10,000 blocks in 25.9, and from one week to one hour in 25.10), so check your values. On ClickHouse Cloud, `SharedMergeTree` replaces `ReplicatedMergeTree`; check the same settings there.
- Plain `MergeTree` deduplicates nothing unless `non_replicated_deduplication_window` is set above `0`.
- Before 26.2, asynchronous inserts and materialized-view targets were not deduplicated by default. From 26.2, `deduplicate_insert` (default `enable`) covers sync and async inserts, and `deduplicate_blocks_in_dependent_materialized_views` defaults to `1`.

Two opposite failures follow from this:

- **Duplicates.** A retry that sends different blocks (rows regrouped, a record appended, different block-size settings) produces new hashes and is written again. So is a retry that arrives after the window has expired.
- **Silent drops.** A new batch whose rows exactly match a recent one is discarded, and so is a batch that reuses an `insert_deduplication_token` with different data. `query_log.written_rows` still counts the dropped rows (and also includes rows written to materialized views), so it cannot show deduplication.

With the pre-26.2 defaults (tested on 25.3), a retried identical insert was dropped from the source table but written twice into a materialized view's target. The target needs its own deduplication log and `deduplicate_blocks_in_dependent_materialized_views = 1` for the view to deduplicate too.

**Incorrect (retry rebuilds the batch, or tokens are reused):**

```python
try:
    client.insert("events", batch)
except TimeoutError:
    # New rows were added, so the blocks hash differently and the rows
    # that were already written are inserted a second time
    client.insert("events", batch + new_events)

# One constant token for every batch: all batches after the first are dropped
client.insert("events", batch, settings={"insert_deduplication_token": "loader"})
```

**Correct (one stable token per logical batch; identical retries):**

```python
token = f"{source}:{partition}:{offset_start}-{offset_end}"
for attempt in range(5):
    try:
        client.insert("events", batch,  # same rows, same order, same settings
                      settings={"insert_deduplication_token": token})
        break
    except (TimeoutError, ConnectionError):
        backoff(attempt)
```

A token also stops legitimately identical batches from being dropped, because the token replaces the data hash. For `INSERT ... SELECT`, the `SELECT` must return the same rows in the same order on every attempt, or you must supply a token. From 26.1, `deduplicate_insert_select` (added in 25.12) defaults to `enable_when_possible`, which deduplicates an `INSERT ... SELECT` only when the `SELECT` is stable (`ORDER BY ALL`, single stream) or a token is set.

**Check the configuration and detect deduplication:**

```sql
-- Server-level defaults. Per-table overrides appear only in the table DDL
SELECT name, value, changed
FROM system.merge_tree_settings
WHERE name IN ('replicated_deduplication_window',
               'replicated_deduplication_window_seconds',
               'non_replicated_deduplication_window');

SELECT name, engine, extract(engine_full, 'SETTINGS (.*)$') AS table_settings
FROM system.tables
WHERE database = 'default' AND name = 'events';

-- Inserts that were fully or partly deduplicated. On Cloud, this reads all replicas
SELECT event_time, query_id, written_rows,
       ProfileEvents['DuplicatedInsertedBlocks'] AS duplicated_blocks
FROM clusterAllReplicas('default', system.query_log)
WHERE event_date >= today() - 1
  AND event_time > now() - INTERVAL 1 HOUR
  AND type = 'QueryFinish'
  AND query_kind = 'Insert'
  AND ProfileEvents['DuplicatedInsertedBlocks'] > 0
ORDER BY event_time DESC
LIMIT 50;
```

`system.text_log` can also show the skipped block. The wording varies by engine and version: on 25.3, `MergeTree` logs `Block with ID ... already exists as part ...; ignoring it`, which does not contain the word "deduplicate". Search for `already exists` as well as `dedup`, and expect nothing if your text log level excludes these messages. For async inserts, check the `DuplicatedAsyncInserts` event.

Block deduplication only covers retries inside the window. If duplicates can still arrive (replays from a queue, retries after the window), make them harmless in the table design, for example with `ReplacingMergeTree` and deduplicating reads. For buffered inserts, see [insert-async-small-batches](insert-async-small-batches.md).

Reference: [Deduplicating inserts on retries](https://clickhouse.com/docs/concepts/features/operations/insert/deduplicating-inserts-on-retries)
