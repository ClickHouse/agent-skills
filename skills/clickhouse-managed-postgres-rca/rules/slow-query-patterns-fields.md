---
title: Pull per-pattern evidence from the Slow Query Patterns API and filter out internal probes
impact: CRITICAL
tags:
  - slow-query-patterns
  - evidence
  - fields
  - beta-api
  - rca
---

# Slow Query Patterns API

## Endpoint (resolve from OpenAPI)

Operation: `slowQueryPatternsGetList` (tag: Postgres). **Beta.**

Before constructing a request, follow `openapi-discovery.md` to
resolve the current path, required query params, and response
schema. The reference snapshot below documents what May 2026
looked like; the live spec is authoritative.

Reference path (May 2026 snapshot):

```
GET https://api.clickhouse.cloud/v1/organizations/{organizationId}/postgres/{postgresId}/slowQueryPatterns
```

Auth: HTTP Basic with a ClickHouse Cloud API key (username) and
secret (password).

## Required query params

The slow-query endpoint requires a time window:

- `from_date` — ISO 8601 UTC date-time.
- `to_date` — ISO 8601 UTC date-time.

For RCA, default to the last 15 minutes.

## Useful optional query params

- `sort_by` — sort key. Reference values from the May 2026
  snapshot: `total_duration` (default), `avg_duration`,
  `call_count`, `total_blks_read`, `total_cpu_time`,
  `error_count`, `max_duration`, `p50_duration`,
  `p95_duration`, `p99_duration`, `total_rows`,
  `total_shared_blks_hit`, `total_wal_bytes`. Confirm enum
  values from the live spec.
- `sort_order` — default `desc`.
- `limit` — default 20, max 500.
- `db_name`, `db_user`, `db_operation`, `app` — filters.

## Request template

The API requires **millisecond precision** on the date-time
strings (`.000Z`). RFC 3339 strings without milliseconds
(e.g., `2026-05-29T10:00:00Z`) are rejected with HTTP 400 even
though the spec just says `format: date-time`. Use the format
below:

```bash
from_date=$(date -u -v-15M +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null \
            || date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%S.000Z)
to_date=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

# Use curl -G with --data-urlencode so the params are encoded
# correctly. Substitute the path resolved from
# openapi-discovery.md.
curl -s -G -u "$CH_CLOUD_KEY:$CH_CLOUD_SECRET" \
  "https://api.clickhouse.cloud/<resolved path>" \
  --data-urlencode "from_date=$from_date" \
  --data-urlencode "to_date=$to_date" \
  --data-urlencode "sort_by=total_duration" \
  --data-urlencode "limit=10"
```

If a request returns `HTTP 400` with body
`BAD_REQUEST: '<your date>'`, the parser rejected that
specific value — verify millisecond precision and the `Z`
suffix.

## Response envelope

Standard ClickHouse Cloud envelope:

```json
{
  "status": 200,
  "requestId": "<uuid>",
  "result": [ { /* pattern */ }, ... ]
}
```

## Field roles (from `openapi-discovery.md`)

Use the role map you built during discovery. The roles you need
for the heuristics:

- `query_id` — pattern identifier.
- `query_text` — normalized SQL.
- `db_operation` — SELECT / INSERT / UPDATE / DELETE / UTILITY.
- `call_count` — executions in the window.
- `total_duration` — aggregate runtime.
- `avg_duration` — mean per-call latency.
- `p50`, `p95`, `p99` — percentile latencies.
- `total_rows` — rows returned/affected across all calls.
- `blocks_read_from_disk` — pages read from disk (cache misses).
- `blocks_served_from_cache` — pages served from cache.
- `total_wal_bytes` — WAL bytes generated.
- `error_count` — failed executions.

When citing values in your reasoning, name the resolved
field (e.g., `totalSharedBlksRead` in the May 2026 snapshot),
not the role.

## Derived values

The API does not return a cache hit ratio. Compute:

```
cache_hit_ratio = <blocks_served_from_cache>
                / max(<blocks_served_from_cache> + <blocks_read_from_disk>, 1)
```

Per-call IO ratio for the full-scan heuristic:

```
blks_touched_per_row = (<blocks_served_from_cache> + <blocks_read_from_disk>)
                     / max(<total_rows>, 1)
```

Use **total blocks touched** (hit + read), not just disk reads.
A hot table fully resident in cache still produces a high
`blks_touched_per_row` if every call scans it.

## Expect ClickHouse Cloud internal probes in the top-N

The control plane runs its own monitoring queries against
managed Postgres instances — `SELECT pg_current_wal_lsn()`,
`SELECT pg_is_in_recovery()`, `SHOW log_directory`, and a
handful of similar admin probes. They appear in the Slow Query
Patterns response with high `callCount` (one per probe
interval) but `totalDurationUs ≈ 0` and zero IO. They don't
affect the diagnosis but waste top-N slots.

**Two-step filter:**

1. Ask for `limit=10` (or higher) on the request so the
   user-traffic patterns survive even if internal probes fill
   the top slots.
2. Post-filter the response — skip any pattern where
   `totalDurationUs` is below, say, 1,000,000 (1s aggregate
   over the window). Real user-traffic patterns will always
   clear that threshold; internal probes won't.

```python
patterns = [p for p in resp['result'] if p['totalDurationUs'] >= 1_000_000]
```

Then take the top 3 by `totalDurationUs` from what remains.

The `app` filter param accepts equality only (no
`app != bin/monitor`), so server-side filtering doesn't work
for "exclude internal probes." Post-filter is the path.

## What this surface does NOT show

- No EXPLAIN plans.
- No scan-type counters.
- No table or column statistics.
- The list is filtered server-side to "slow" patterns — there
  may be other patterns the API doesn't surface.

Reason from the IO and timing signal, not the plan tree.
