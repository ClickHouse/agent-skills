---
title: Read System Log Tables as Bounded, Per-Replica Evidence
impact: HIGH
impactDescription: "Unbounded or single-replica reads of query_log and other system logs give incomplete, double-counted, or misleading evidence"
tags: [agent, system-tables, query_log, part_log, text_log, clusterAllReplicas, diagnostics]
---

## Read System Log Tables as Bounded, Per-Replica Evidence

**Impact: HIGH**

System log tables (`query_log`, `part_log`, `text_log`, `error_log`, `metric_log`, and others ending in `_log`) are ordinary local MergeTree tables written by each server. On ClickHouse Cloud each replica writes its own rows, so a plain `FROM system.query_log` shows only the replica your connection landed on. Read them through `clusterAllReplicas('default', system.<log>)` and keep `hostname` in the output. On self-managed clusters, use a cluster name from `system.clusters`; `default` may not exist. The generic limits in [agent-query-safety](agent-query-safety.md) still apply. This rule covers what is specific to reading system logs as evidence.

**Incorrect (one replica, unbounded, double counted, raw text copied out):**

```sql
-- On Cloud this reads a single replica. It scans all retained history,
-- counts every query twice (QueryStart + QueryFinish rows) plus its
-- child queries, and returns raw query text that may contain customer data.
SELECT *
FROM system.query_log
WHERE query LIKE '%orders%'
ORDER BY query_duration_ms DESC
```

**Correct (check coverage first, then aggregate over a bounded window):**

```sql
-- 1. What history does each replica still hold? Reads part metadata only.
SELECT
    hostname() AS replica,
    table,
    min(min_date) AS oldest_day,
    max(max_date) AS newest_day
FROM clusterAllReplicas('default', system.parts)
WHERE database = 'system' AND match(table, '^query_log(_[0-9]+)?$') AND active
GROUP BY replica, table
ORDER BY replica, table
SETTINGS skip_unavailable_shards = 1;

-- 2. Query shapes in the last 6 hours: one row per finished query.
SELECT
    normalized_query_hash,
    any(substring(normalizeQuery(query), 1, 120)) AS query_shape,
    count() AS runs,
    countIf(exception_code != 0) AS failed,
    quantile(0.5)(query_duration_ms) AS p50_ms,
    max(query_duration_ms) AS max_ms,
    formatReadableSize(max(memory_usage)) AS max_memory,
    sum(ProfileEvents['SelectedMarks']) AS marks_selected
FROM clusterAllReplicas('default', system.query_log)
WHERE event_date >= toDate(now() - INTERVAL 6 HOUR)
  AND event_time >= now() - INTERVAL 6 HOUR
  AND type != 'QueryStart'
  AND is_initial_query = 1
GROUP BY normalized_query_hash
ORDER BY runs DESC
LIMIT 20
SETTINGS skip_unavailable_shards = 1;
```

**Bounding and cost:**

- Filter on both `event_date` and `event_time`. The log tables are partitioned by `toYYYYMM(event_date)` and sorted by `(event_date, event_time)`, so the date predicate lets the query skip whole partitions and the time predicate trims within them. Check with `SELECT partition_key, sorting_key FROM system.tables WHERE database = 'system' AND name = 'query_log'`. Do not alias an expression as `event_date`, because the alias shadows the column.
- Select only the columns you need. `query_log` and `metric_log` are wide, and `SELECT *` reads every column.
- `skip_unavailable_shards = 1` stops one unreachable replica (for example, during scaling) from failing the query. The result then lacks that replica's rows, so compare the `hostname` values you got against the replicas you expected.

**`query_log` semantics:**

- A successful query writes a `QueryStart` row and a `QueryFinish` row. A query that fails while running writes `QueryStart` and `ExceptionWhileProcessing`. A query that fails before it starts (for example, a syntax error or an unknown table) writes only `ExceptionBeforeStart`. `type != 'QueryStart'` gives exactly one row per query. `type = 'QueryStart'` misses queries that failed before starting, and `QueryStart` rows have no duration or resource figures.
- Distributed and internal sub-queries get their own rows with `is_initial_query = 0`, often on other replicas, and they carry rewritten query text. Filter `is_initial_query = 1` for counts. To follow one request across replicas, filter `initial_query_id = '<id>'`.
- Group by `normalized_query_hash` (identical for queries that differ only in literals), not by `query` text. Filter failures with `exception_code != 0` and label them with `errorCodeToName(exception_code)`.
- `ProfileEvents` is a `Map`. Read `ProfileEvents['SelectedMarks']` and similar keys directly. A missing key returns 0, not NULL, so misspell a key and you silently get 0.
- The `query` and `exception` columns are raw text and can contain literal values such as customer identifiers or email addresses. Share `normalizeQuery(query)`, `normalized_query_hash` and `query_id` in tickets or chat. Leave raw text out unless you have redacted it.

**Other log tables:**

- `part_log.event_type` and `text_log.level` are `Enum8`. Compare them with the exact literal (`event_type = 'MergeParts'`). Enum comparisons follow the enum's numeric order, so `level <= 'Warning'` selects Fatal through Warning. A misspelled enum literal can return zero rows with no error (observed on 25.3), so an empty result can mean a typo. `part_log` also records `MergePartsStart` and `MutatePartStart` rows, which have no duration. Use `MergeParts` and `MutatePart` rows when you measure merges or mutations.
- A single failure can produce several `text_log` lines from different loggers. Count failures from `query_log` or `error_log`, and use `text_log` for the messages around a specific `query_id`.

**Absence is not evidence until coverage is checked:**

- Retention depends on each table's TTL, which the server config sets. Without a TTL the logs grow indefinitely (the self-managed default). Other deployments may keep a shorter window, so don't assume how far back the logs go. Read `SHOW CREATE TABLE system.query_log` and the coverage query above before concluding "this never happened". An empty result outside the retained window, or from a replica that was replaced or unreachable, proves nothing.
- After an upgrade that changes a log table's schema, ClickHouse renames the old table (`query_log_1`, `query_log_2`, ...). `merge('system', '^query_log')` reads all of them, but the columns may differ between them.
- `SYSTEM FLUSH LOGS` needs the `SYSTEM FLUSH LOGS` privilege. You only need it to see events from the last few seconds, which are still buffered in memory. Past events are already on disk, so you can wait out the flush interval instead.

Reference: [System tables in ClickHouse Cloud](https://clickhouse.com/docs/reference/system-tables/overview#system-tables-in-clickhouse-cloud) · [system.query_log](https://clickhouse.com/docs/reference/system-tables/query_log) · [Diagnose slow queries](https://clickhouse.com/docs/guides/clickhouse/performance-and-monitoring/diagnose-slow-queries) · [system.part_log](https://clickhouse.com/docs/reference/system-tables/part_log) · [system.text_log](https://clickhouse.com/docs/reference/system-tables/text_log)
