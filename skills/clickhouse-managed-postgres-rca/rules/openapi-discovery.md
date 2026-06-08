---
title: Resolve live API paths and a semantic role map from the OpenAPI spec before any request
impact: CRITICAL
tags:
  - openapi
  - discovery
  - role-map
  - beta-api
  - caching
---

# OpenAPI discovery

Both endpoints this skill uses are **Beta**. Field names and
paths may shift. Before constructing any requests, resolve the
current shape from the live OpenAPI spec.

## How (with 24h cache)

The spec changes rarely. Cache the resolved paths + role map to
`/tmp/ch-cloud-rca-cache.json` after a successful discovery,
and reuse it for up to 24 hours before re-fetching.

Boilerplate (run at session start):

```bash
CACHE=/tmp/ch-cloud-rca-cache.json
TTL=86400  # 24 hours

if [ -f "$CACHE" ]; then
  if command -v stat >/dev/null 2>&1; then
    # macOS BSD stat; GNU stat fallback for Linux
    mtime=$(stat -f %m "$CACHE" 2>/dev/null || stat -c %Y "$CACHE")
  fi
  age=$(( $(date +%s) - mtime ))
else
  age=$((TTL + 1))
fi

if [ "$age" -lt "$TTL" ]; then
  echo "openapi-discovery: using cache ($((age/3600))h old)"
else
  echo "openapi-discovery: re-fetching spec"
  curl -s https://api.clickhouse.cloud/v1 > /tmp/ch-cloud-openapi.json
  # ...then parse + write $CACHE; see "Cache format" below.
fi
```

The cache lets the skill skip the ~863 KB fetch + parse on
every session. Twenty-four hours is generous; the underlying
schema shifts on a weeks-to-months cadence, not daily.

## Cache format

After a fresh fetch, write the resolved knowledge to
`/tmp/ch-cloud-rca-cache.json`:

```json
{
  "paths": {
    "postgresInstancePrometheusGet": "/v1/organizations/{organizationId}/postgres/{postgresId}/prometheus",
    "slowQueryPatternsGetList": "/v1/organizations/{organizationId}/postgres/{postgresId}/slowQueryPatterns"
  },
  "role_map": {
    "call_count": "callCount",
    "total_duration": "totalDurationUs",
    "total_rows": "totalRows",
    "blocks_read_from_disk": "totalSharedBlksRead",
    "blocks_served_from_cache": "totalSharedBlksHit",
    ...
  }
}
```

`cat /tmp/ch-cloud-rca-cache.json` is also a useful debugging
hook between sessions: it shows exactly what the agent thinks
the API looks like.

## Invalidating the cache

Two reasons to invalidate before the 24h TTL expires:

1. A request returned `HTTP 400` with a message mentioning a
   field name that's in `role_map` — the field was renamed or
   removed. Re-fetch.
2. The user explicitly asks for a refresh. Run
   `rm /tmp/ch-cloud-rca-cache.json` and re-run discovery.

Don't invalidate on every 4xx — date-format or value errors
won't shift the spec.

## Operations to locate

- **`slowQueryPatternsGetList`** (tag: Postgres) — list slow
  query patterns for a Postgres service.
- **`postgresInstancePrometheusGet`** (tag: Prometheus) —
  scrape Prom for a Postgres service.

Find them by `operationId`, not by path. Paths may move
between spec versions; operation IDs are the stable contract.

## What to extract per operation

From the matched `paths` entry:

- The HTTP path template (e.g.
  `/v1/organizations/{organizationId}/postgres/{postgresId}/...`).
- Path parameter names — typically `organizationId` and a
  Postgres-service ID (current spec calls it `postgresId`).
- Required query parameters. The slow-query endpoint
  currently requires `from_date` and `to_date` (ISO 8601 UTC).

From the `responses['200'].content['application/json'].schema`
(follow `$ref` into `components.schemas`):

- For `slowQueryPatternsGetList`: the response envelope wraps
  `result: array of <PatternSchema>`. Walk into the
  `<PatternSchema>` `properties`.

For `postgresInstancePrometheusGet`, the response is
`text/plain` in Prometheus exposition format. There's no JSON
schema; field discovery for Prom happens by scraping the
endpoint and reading the metric names directly.

## Build a role map for the slow-query schema

For each property in the resolved pattern schema, identify its
**semantic role** from the `description` field, not from the
name. Build a session-scoped map `{ role: actual_field_name }`.

Roles to identify:

| Role | Identify by description containing |
|---|---|
| `query_id` | "identifier for the query pattern" |
| `query_text` | "normalized query text" |
| `db_operation` | "SQL operation type" / "SELECT, INSERT, ..." |
| `call_count` | "Number of times the pattern executed" |
| `error_count` | "executions ... that raised an error" |
| `total_duration` | "Total execution time across all calls" |
| `avg_duration` | "Average execution time per call" |
| `max_duration` | "Maximum execution time" |
| `p50` / `p95` / `p99` | "percentile execution time" |
| `total_rows` | "rows returned or affected" |
| `blocks_read_from_disk` | "blocks read from disk" / "cache misses" |
| `blocks_served_from_cache` | "blocks hit" / "cache hits" |
| `total_cpu_time` | "Total CPU time" |
| `total_wal_bytes` | "WAL" / "write-ahead log" |

When you reference these in your reasoning, use the **resolved
actual name** (e.g., the spec's current camelCase or snake_case
spelling), not the role.

## Spotting drift

If you can't find a property whose description matches a role:

- Note it explicitly: "Role `blocks_served_from_cache`: no
  matching field in the current spec."
- Proceed with the diminished signal (e.g., for full-scan
  detection, fall back to disk-reads only — but flag the
  ambiguity in the recommendation).
- Don't guess at field names. Unresolved roles are real gaps.

## Reference: May 2026 spec snapshot

For sanity-checking only. The live spec is authoritative.

```
call_count               -> callCount
error_count              -> errorCount
total_duration           -> totalDurationUs
avg_duration             -> avgDurationUs
max_duration             -> maxDurationUs
p50 / p95 / p99          -> p50DurationUs / p95DurationUs / p99DurationUs
total_rows               -> totalRows
blocks_read_from_disk    -> totalSharedBlksRead
blocks_served_from_cache -> totalSharedBlksHit
total_cpu_time           -> totalCpuTimeUs
total_wal_bytes          -> totalWalBytes
query_text               -> queryText
db_operation             -> dbOperation
```

Always rebuild from the live spec; don't paste this in as a
substitute for discovery.
