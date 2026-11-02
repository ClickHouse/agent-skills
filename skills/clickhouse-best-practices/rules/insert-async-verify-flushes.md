---
title: Check asynchronous_insert_log When Using wait_for_async_insert=0
impact: HIGH
impactDescription: "Fire-and-forget async inserts return success for data that later fails to parse or flush"
tags: [insert, async, wait_for_async_insert, monitoring, data-loss]
---

## Check asynchronous_insert_log When Using wait_for_async_insert=0

**Impact: HIGH**

With `async_insert = 1` and `wait_for_async_insert = 0`, the server acknowledges an INSERT once the data is in its in-memory buffer. Parsing, type checks, and the write to the table happen later, at flush time. If they fail, the client never finds out: the HTTP response is `200`, and the INSERT's own `system.query_log` row is a `QueryFinish` with no exception. `system.asynchronous_insert_log` records the outcome of every buffered INSERT.

On 25.3, the two failure types looked like this:

- **`ParsingError`**: one malformed row rejects every row from that INSERT, not only the bad row. No `query_log` row carries the error.
- **`FlushError`**: the flush itself fails, for example with `TOO_MANY_PARTS`, and the buffered rows are not written. The error appears in `query_log` only on the separate flush query (`query_kind = 'AsyncInsertFlush'`).

For how to enable async inserts and choose a return mode, see [insert-async-small-batches](insert-async-small-batches.md). Before relying on the defaults, check them on your version: `async_insert` is enabled by default from 26.2, and several defaults differ on ClickHouse Cloud.

**Incorrect (treating the acknowledgement as proof of the write):**

```sql
-- id is UInt64. Returns success as soon as the row is buffered
INSERT INTO events SETTINGS async_insert = 1, wait_for_async_insert = 0
VALUES ('not-a-number');

-- Looks clean even though nothing was written: parse errors are not in
-- query_log, and flush errors are logged under query_kind 'AsyncInsertFlush'
SELECT query_id, exception_code
FROM system.query_log
WHERE event_date = today() AND exception_code != 0 AND query_kind = 'Insert'
LIMIT 20;
```

**Correct (alert on non-Ok flush outcomes):**

```sql
-- On ClickHouse Cloud, clusterAllReplicas reads every replica's buffer log
SELECT
    toStartOfFiveMinutes(event_time) AS t,
    database,
    table,
    status,
    count() AS inserts,
    any(substring(exception, 1, 200)) AS sample_error
FROM clusterAllReplicas('default', system.asynchronous_insert_log)
WHERE event_date >= today() - 1
  AND event_time > now() - INTERVAL 6 HOUR
  AND status != 'Ok'
GROUP BY t, database, table, status
ORDER BY t DESC
LIMIT 100;
```

`query_id` in this log is the ID of the original INSERT, and `flush_query_id` is the ID of the flush query that wrote the batch, so you can join either to `system.query_log`. The `rows` column is `0` for a `ParsingError`, so count failed inserts, not rows. The server-wide `FailedAsyncInsertQuery` counter in `system.events` shows whether any failures have happened since startup.

This log exists only when the server config enables the `asynchronous_insert_log` section. If `SELECT count() FROM system.asynchronous_insert_log` fails or returns nothing while async inserts are running, you have no record of flush errors: switch to `wait_for_async_insert = 1`.

**Flush timing, for reading the log:**
- A buffer is kept per table, query shape, and settings combination, on each server. Inserts with different settings do not share a buffer.
- A buffer flushes when it reaches `async_insert_max_data_size`, or when the busy timeout expires. With `async_insert_use_adaptive_busy_timeout` (default since 24.2) the timeout moves between `async_insert_busy_timeout_min_ms` and `async_insert_busy_timeout_max_ms`.
- `async_insert_max_query_number` triggers a flush only when deduplication is enabled for the insert. Before 26.2, async insert deduplication was off by default.
- Each flush writes at least one part per partition in the buffer, so a high-cardinality partition key still produces many parts.

Reference: [Asynchronous inserts](https://clickhouse.com/docs/concepts/features/operations/insert/asyncinserts)
