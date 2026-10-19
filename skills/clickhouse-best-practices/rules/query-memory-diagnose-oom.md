---
title: Diagnose MEMORY_LIMIT_EXCEEDED Before Raising Limits
impact: HIGH
impactDescription: "Error 241 has at least three causes; raising max_memory_usage addresses only one of them"
tags: [query, memory, OOM, MEMORY_LIMIT_EXCEEDED, query_log, metric_log]
---

## Diagnose MEMORY_LIMIT_EXCEEDED Before Raising Limits

**Impact: HIGH**

`MEMORY_LIMIT_EXCEEDED` (code 241) means that one memory tracker reached its limit. The tracker can belong to the query, to the user, or to the whole server. The message names it. Before 24.11 the wording is `Memory limit (for query)`, `(for user)` or `(total)`. From 24.11 it is `Query memory limit exceeded`, `User memory limit exceeded` or `(total) memory limit exceeded` (the server-level message also reports current RSS). If the message contains `OvercommitTracker decision`, the user or the server was under memory pressure and the overcommit tracker intervened; `Query was selected to stop by OvercommitTracker` means it picked this query to free memory. The query that failed may not be the one using the most memory.

**Incorrect (treating the failed query's memory_usage as its demand):**

```sql
-- memory_usage of a failed query stops near the limit that stopped it.
-- The same query without a limit can need many times more.
SELECT memory_usage FROM system.query_log
WHERE event_date = today() AND exception_code = 241
LIMIT 1;
-- ...then raising max_memory_usage for everyone.
```

**Correct (find which tracker failed, then compare with what else was running):**

```sql
-- 1. The failures, with the tracker named in the message
SELECT event_time, hostname, query_id, user, normalized_query_hash,
       formatReadableSize(memory_usage) AS mem_at_failure,
       substring(exception, 1, 160) AS error
FROM clusterAllReplicas('default', system.query_log)
WHERE event_date >= today() - 1
  AND type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')
  AND exception_code = 241
ORDER BY event_time DESC
LIMIT 20;

-- 2. Queries running at the failure time t, largest first
WITH toDateTime('2026-09-29 15:10:04') AS t
SELECT hostname, query_id, user, type, formatReadableSize(memory_usage) AS peak_mem,
       query_start_time, query_duration_ms, substring(query, 1, 80) AS q
FROM clusterAllReplicas('default', system.query_log)
WHERE event_date >= toDate(t) - 1
  AND event_time BETWEEN t AND t + INTERVAL 1 HOUR
  AND query_start_time <= t
  AND type != 'QueryStart'
ORDER BY memory_usage DESC
LIMIT 10;

-- 3. Server-level tracked memory and concurrency around t
WITH toDateTime('2026-09-29 15:10:04') AS t
SELECT hostname, toStartOfMinute(event_time) AS minute,
       formatReadableSize(max(CurrentMetric_MemoryTracking)) AS tracked_peak,
       formatReadableSize(max(CurrentMetric_MergesMutationsMemoryTracking)) AS merges_peak,
       max(CurrentMetric_Query) AS queries_peak
FROM clusterAllReplicas('default', system.metric_log)
WHERE event_date >= toDate(t) - 1
  AND event_time BETWEEN t - INTERVAL 30 MINUTE AND t + INTERVAL 5 MINUTE
GROUP BY hostname, minute
ORDER BY hostname, minute
LIMIT 100;

-- 4. Process RSS compared with what the allocator holds (trend over days, not one sample)
SELECT hostname, toStartOfHour(event_time) AS hour,
       formatReadableSize(maxIf(value, metric = 'MemoryResident')) AS rss,
       formatReadableSize(maxIf(value, metric = 'jemalloc.resident')) AS allocator_resident,
       formatReadableSize(maxIf(value, metric = 'jemalloc.allocated')) AS allocated
FROM clusterAllReplicas('default', system.asynchronous_metric_log)
WHERE event_date >= today() - 7
  AND metric IN ('MemoryResident', 'jemalloc.resident', 'jemalloc.allocated')
GROUP BY hostname, hour
ORDER BY hostname, hour
LIMIT 1000;
```

The queries read every replica, as needed on ClickHouse Cloud; on self-managed servers use your cluster name or the local tables. `system.asynchronous_metric_log` exists only when the server config enables it, and `MemoryResident` is reported on Linux and FreeBSD only.

**Reading the evidence:**

| Evidence | Likely cause | Direction |
|----------|--------------|-----------|
| Query-level message; the peers are small; the same `normalized_query_hash` fails repeatedly | One heavy query | Change the query shape (below); compare its executions as in [query-perf-compare-executions](query-perf-compare-executions.md) |
| User or total message, or an `OvercommitTracker decision`; several large peers; `tracked_peak` near the server limit | Total demand from concurrent queries and merges | Reduce or spread out concurrency; set per-user limits |
| RSS well above `allocated`, with per-query memory flat while traffic grew | Memory the allocator keeps after earlier peaks | Not a single-query problem. `SYSTEM JEMALLOC PURGE` returned retained pages locally but left `jemalloc.allocated` unchanged, so it is not a fix |

**Fixes for one heavy query:**

- **Spill to disk.** Set `max_bytes_before_external_group_by` or `max_bytes_before_external_sort`. The docs advise setting `max_memory_usage` about twice as high, because merging the spilled data needs memory too. `max_bytes_ratio_before_external_group_by` (24.12 and later; default 0.5 from 25.1) is a fraction of the memory left to the user and the server, not of `max_memory_usage`. When the per-query limit is far below server memory, the ratio does not trigger. Locally, a query under a per-query limit failed without spilling, and succeeded once an explicit threshold of about half the limit was set. `ProfileEvents['ExternalAggregationWritePart']` and `['ExternalSortWritePart']` in `query_log` show whether a spill happened.
- **Approximate distinct counts.** `count(DISTINCT x)` runs as `uniqExact` by default (`count_distinct_implementation`). Where an approximate count is acceptable, `uniq` used markedly less memory than `uniqExact` for the same GROUP BY locally.
- **Aggregate in key order.** When GROUP BY starts with the table's sort-key prefix, `optimize_aggregation_in_order = 1` cut peak memory several-fold locally. It was slightly slower.
- **JOINs.** The right-hand side is usually built in memory. See [query-join-choose-algorithm](query-join-choose-algorithm.md), [query-join-filter-before](query-join-filter-before.md) and [query-join-consider-alternatives](query-join-consider-alternatives.md).
- **Limits.** `max_memory_usage` is per query. The server-wide ceiling (`max_server_memory_usage`) is separate. A per-query limit above what the server can supply turns a query-level failure into a `(total)` failure. At that point the overcommit tracker can stop whichever query has the largest overcommit ratio, and that may be a different query.

Reference: [GROUP BY in external memory](https://clickhouse.com/docs/reference/statements/select/group-by#group-by-in-external-memory) · [Memory overcommit](https://clickhouse.com/docs/concepts/features/configuration/settings/memory-overcommit) · [system.asynchronous_metrics](https://clickhouse.com/docs/reference/system-tables/asynchronous_metrics)
