---
title: Diagnose Slow or Failing Inserts Through Their Materialized Views
impact: HIGH
impactDescription: "Every incremental view runs inside the INSERT; one slow or failing view delays or fails the whole insert"
tags: [query, materialized-view, insert, query_views_log, parallel_view_processing, diagnostics]
---

## Diagnose Slow or Failing Inserts Through Their Materialized Views

**Impact: HIGH**

Incremental materialized views run synchronously as part of the `INSERT` into their source table. The client gets its acknowledgement only after every attached view (and every view chained after them) has processed the block. So insert latency includes the slowest view's work, and a view that throws makes the `INSERT` fail.

A failed `INSERT` is not rolled back. Blocks already written to the source table and to other views stay written, and later blocks are not written. A client that retries the whole batch can therefore duplicate rows in the source and in views that succeeded, unless insert deduplication covers the retry.

`system.query_views_log` records each view's run within an insert: duration, rows read and written, memory, status and exception. It depends on the `log_query_views` setting and the server's `query_views_log` configuration, so first check that the table has recent rows.

**Incorrect (reading only the insert's own log entry):**

```sql
-- Shows that the INSERT was slow or failed, but not which view caused it.
SELECT event_time, query_duration_ms, exception
FROM system.query_log
WHERE event_date >= today() - 1
  AND query_kind = 'Insert'
  AND type != 'QueryStart'
ORDER BY query_duration_ms DESC
LIMIT 20;
```

**Correct (break each slow or failed insert down per view):**

```sql
-- On ClickHouse Cloud both logs are per replica, so read them across replicas.
SELECT
    q.event_time,
    q.query_duration_ms,
    q.type AS insert_status,
    v.view_name,
    v.view_duration_ms,
    v.read_rows,
    v.written_rows,
    formatReadableSize(v.peak_memory_usage) AS view_memory,
    v.status AS view_status,
    substring(v.exception, 1, 200) AS view_exception
FROM clusterAllReplicas('default', system.query_log) AS q
INNER JOIN
(
    SELECT initial_query_id, view_name, view_duration_ms, read_rows, written_rows,
           peak_memory_usage, status, exception
    FROM clusterAllReplicas('default', system.query_views_log)
    WHERE event_date >= today() - 1
) AS v ON v.initial_query_id = q.query_id
WHERE q.event_date >= today() - 1
  AND q.event_time >= now() - INTERVAL 6 HOUR
  AND q.query_kind = 'Insert'
  AND q.type IN ('QueryFinish', 'ExceptionWhileProcessing')
  AND (q.query_duration_ms > 1000 OR q.type = 'ExceptionWhileProcessing'
       OR v.status != 'QueryFinish')
ORDER BY q.event_time DESC, v.view_duration_ms DESC
LIMIT 100;
```

The `v.status` condition also catches view failures that `materialized_views_ignore_errors = 1` hid from the client, where the insert itself reports `QueryFinish`. On a self-managed single server, drop `clusterAllReplicas` and read the local tables. Adjust the time window and the duration filter to your workload. A view with `read_rows` far above the insert's own row count usually reads another table on every block, typically the right-hand side of a JOIN (see [query-mv-chained-and-joins](query-mv-chained-and-joins.md)).

**Reducing the cost:**

- Fix the view the log points to first: simplify its query, replace a JOIN on a large table with a dictionary, or move heavy work to a refreshable view (see [query-mv-refreshable](query-mv-refreshable.md)).
- `parallel_view_processing = 1` runs the views attached to one table concurrently instead of one after another (the default is `0`). It can cut wall-clock insert time when several views are attached, at the cost of more concurrent CPU and memory, and it does not help when one view dominates. Measure both settings on representative inserts.
- `materialized_views_ignore_errors = 1` makes the `INSERT` succeed when a view fails, but the failing view's target silently misses those rows. Use it only when that divergence is acceptable and you will backfill.

Reference: [system.query_views_log](https://clickhouse.com/docs/reference/system-tables/query_views_log), [CREATE VIEW: materialized view](https://clickhouse.com/docs/reference/statements/create/view#materialized-view), [Parallel vs sequential processing](https://clickhouse.com/docs/concepts/features/materialized-views/incremental-materialized-view#materialized-views-parallel-vs-sequential)
