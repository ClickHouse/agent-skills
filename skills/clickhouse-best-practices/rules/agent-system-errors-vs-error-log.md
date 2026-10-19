---
title: Count Recent Errors From system.error_log, Not system.errors
impact: MEDIUM-HIGH
impactDescription: "system.errors is a since-restart counter; treating it as a time window, or differencing error_log, gives wrong error counts"
tags: [agent, system-tables, errors, error_log, diagnostics]
---

## Count Recent Errors From system.error_log, Not system.errors

**Impact: MEDIUM-HIGH**

`system.errors` holds one in-memory counter per error code **since the server started** (it resets on restart) plus the latest message and `last_error_time`. `system.error_log` stores `value` as the count **during one collection interval**, with a row written only for intervals where the count went up. To count errors in a window, `sum(value)` over `error_log` rows; never take differences between rows as you would for a cumulative counter.

Both tables also carry `remote`: when a distributed or `clusterAllReplicas` sub-query fails, the replica that raised the error records it with `remote = 0` and the initiator records it again with `remote = 1`, so summing both counts one failure twice.

**Incorrect (a since-restart counter read as "recent", or interval counts differenced):**

```sql
-- Since-restart totals on one replica; a drop between reads means a restart.
SELECT name, value FROM system.errors ORDER BY value DESC LIMIT 10;

-- value is already per interval: deltas between rows discard real occurrences.
SELECT error, sum(greatest(value - prev, 0)) AS occurrences
FROM
(
    SELECT error, value,
        lagInFrame(value, 1, value) OVER (PARTITION BY hostname, code, remote ORDER BY event_time) AS prev
    FROM clusterAllReplicas('default', system.error_log)
    WHERE event_date >= toDate(now() - INTERVAL 6 HOUR) AND event_time >= now() - INTERVAL 6 HOUR
)
GROUP BY error;
```

**Correct (errors in the last N hours across replicas):**

```sql
SELECT
    code,
    error,
    sum(value) AS occurrences,
    sumIf(value, remote = 0) AS raised_locally,
    max(event_time) AS last_seen
FROM clusterAllReplicas('default', system.error_log)
WHERE event_date >= toDate(now() - INTERVAL 6 HOUR)
  AND event_time >= now() - INTERVAL 6 HOUR
GROUP BY code, error
ORDER BY occurrences DESC
LIMIT 20
SETTINGS skip_unavailable_shards = 1;
```

**Errors are not failed queries.** Some error codes are raised and handled internally while the query still succeeds. For user-visible failures, count `exception_code != 0` in `query_log`. For bounding, replica coverage and other log-table reading rules, see [agent-system-tables-read-safely](agent-system-tables-read-safely.md).

Reference: [system.error_log](https://clickhouse.com/docs/reference/system-tables/error_log) · [system.errors](https://clickhouse.com/docs/reference/system-tables/errors)
