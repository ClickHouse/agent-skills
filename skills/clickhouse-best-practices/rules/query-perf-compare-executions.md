---
title: Compare Individual Executions When a Query Gets Slower
impact: MEDIUM
impactDescription: "Averages mix data growth, cold caches and contention; single executions separate them"
tags: [query, performance, query_log, ProfileEvents, normalized_query_hash, diagnostics]
---

## Compare Individual Executions When a Query Gets Slower

**Impact: MEDIUM**

When a query that used to be fast gets slower, list its individual executions and compare them. Group them by `normalized_query_hash`, which is the same for queries that differ only in literal values. An hourly average of duration looks the same whether the table grew, a cache was cold, or other queries were competing for CPU. The rows read and the ProfileEvents of each execution tell these cases apart.

**Incorrect (averaging hides which executions were slow and why):**

```sql
SELECT toStartOfHour(event_time) AS hour, avg(query_duration_ms) AS avg_ms
FROM system.query_log
WHERE event_date >= today() - 1 AND type = 'QueryFinish'
GROUP BY hour
ORDER BY hour;
```

**Correct (one row per execution of one query shape):**

```sql
-- 1. Query shapes that use the most total time
SELECT normalized_query_hash, count() AS runs,
       quantiles(0.5, 0.95)(query_duration_ms) AS p50_p95_ms,
       any(substring(normalizeQuery(query), 1, 100)) AS sample
FROM clusterAllReplicas('default', system.query_log)
WHERE event_date >= today() - 1 AND type = 'QueryFinish' AND query_kind = 'Select'
GROUP BY normalized_query_hash
ORDER BY sum(query_duration_ms) DESC
LIMIT 10;

-- 2. Each execution of one shape (put the hash from step 1 here)
SELECT event_time, hostname, query_duration_ms, read_rows,
       ProfileEvents['SelectedMarks'] AS marks,
       ProfileEvents['MarkCacheMisses'] AS mark_cache_misses,
       formatReadableSize(ProfileEvents['CachedReadBufferReadFromSourceBytes']) AS fs_cache_miss,
       formatReadableSize(ProfileEvents['CachedReadBufferReadFromCacheBytes']) AS fs_cache_hit,
       formatReadableSize(ProfileEvents['OSReadBytes']) AS disk_read,
       round(ProfileEvents['OSCPUWaitMicroseconds'] / 1e6, 2) AS cpu_wait_s
FROM clusterAllReplicas('default', system.query_log)
WHERE event_date >= today() - 1
  AND type = 'QueryFinish'
  AND normalized_query_hash = 1448941773548997605
ORDER BY event_time DESC
LIMIT 50;

-- 3. Concurrency on that host around one slow execution
WITH toDateTime('2026-09-29 15:13:18') AS slow_run_end
SELECT hostname, max(CurrentMetric_Query) AS concurrent_queries,
       sum(ProfileEvent_SelectedRows) AS rows_read_by_all_queries
FROM clusterAllReplicas('default', system.metric_log)
WHERE event_date >= toDate(slow_run_end) - 1
  AND event_time BETWEEN slow_run_end - INTERVAL 10 SECOND AND slow_run_end
GROUP BY hostname
LIMIT 10;
```

**Reading the slow executions against the fast ones:**

| Slow executions show | Likely cause | Next step |
|----------------------|--------------|-----------|
| More `read_rows` and `marks` | More data read: the table grew, the filter matched more, or pruning was lost | Compare `SelectedMarks` with `SelectedMarksTotal`; see [query-index-verify-usage](query-index-verify-usage.md) |
| Same rows, more `fs_cache_miss`, `disk_read` or `mark_cache_misses` | Cold caches | Check whether the slow runs cluster on one `hostname`; caches are per replica |
| Same rows, same cache profile, higher `cpu_wait_s` or `concurrent_queries` | Contention with other work | Find the concurrent queries, merges or inserts on that host |

In a local reproduction with one query shape, concurrent heavy queries made it several times slower with rows and marks unchanged, while adding matching rows raised `read_rows` and the duration together.

**Notes:**
- The queries read every replica through `clusterAllReplicas('default', ...)`, as needed on ClickHouse Cloud. On self-managed servers, use your cluster name or the local table.
- `normalized_query_hash` replaces literal values with placeholders, and IN lists of two or more values with one placeholder. `IN (1, 2, 3)` and `IN (5, 6)` get the same hash. `IN (1)`, `= 8` and `IN (9, 10)` each get a different one, as do queries with different SETTINGS names.
- On ClickHouse Cloud the filesystem cache differs from replica to replica, depending on each replica's activity. `CachedReadBuffer*` events cover reads through that cache. `OSReadBytes` and `OSCPUWaitMicroseconds` come from the operating system and are 0 where the OS does not report them.
- Cache-miss and CPU-wait values are evidence that fits a cause. They do not prove it. Look for the same pattern across several slow executions before you act.

Reference: [system.query_log](https://clickhouse.com/docs/reference/system-tables/query_log) · [system.events](https://clickhouse.com/docs/reference/system-tables/events) · [Cloud console metrics](https://clickhouse.com/docs/products/cloud/features/monitoring/cloud-console) · [Parallel replicas and cache locality](https://clickhouse.com/docs/products/cloud/features/infrastructure/parallel-replicas)
