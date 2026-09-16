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

## Discovery and reuse

Fetch the OpenAPI document at `https://api.clickhouse.cloud/v1` when no verified mapping is available. Locate the operations below and resolve their parameter/response schemas. Reuse a mapping established in this session or a recent cache that records the spec URL and fetch timestamp; do not rediscover it for every request.

If caching, store only schema metadata, not credentials or response data, in a task-specific location. A 24-hour cache is a convenience, not a freshness guarantee. Refresh when the user requests it or a response indicates schema drift; ordinary authentication or invalid-value errors need their own diagnosis.

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

Use the live spec or a verified recent mapping; this historical snapshot is not a substitute for discovery.
