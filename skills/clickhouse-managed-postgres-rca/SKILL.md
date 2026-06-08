---
name: clickhouse-managed-postgres-rca
description: MUST USE when investigating performance issues on a ClickHouse-managed Postgres instance. Provides an evidence-based RCA workflow that scrapes the Prometheus endpoint for system signal, pulls per-digest evidence from the Slow Query Patterns API, and recommends (does not apply) a fix.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.1.0"
---

# ClickHouse Managed Postgres RCA

## When to use

Trigger whenever a user reports slowness, high CPU, low
throughput, cache thrash, or any unexplained pain on a
ClickHouse-managed Postgres instance.

## What you have access to

Two APIs on `https://api.clickhouse.cloud` (HTTP Basic auth
using a ClickHouse Cloud API key/secret pair):

- **Prometheus metrics** — operation `postgresInstancePrometheusGet`
  under the Prometheus tag. Returns Prometheus exposition format.
  System and workload metrics for one Postgres service.
- **Slow Query Patterns** — operation `slowQueryPatternsGetList`
  under the Postgres tag. Returns per-digest latency, IO, and
  call statistics for normalized query patterns. **Beta.**

Both endpoints require an `organizationId` and a `serviceId` as
path parameters. The user must supply both, plus the API
key/secret pair.

## What you do NOT have

- Query plans / EXPLAIN output.
- Per-table scan-type counters (`seq_scan` / `idx_scan`).
- Autovacuum or last-ANALYZE timestamps.

Reason from IO and timing signals, not from a plan tree.

## Workflow

Six steps, in order. Do not skip ahead.

Steps 2 and 3 only share auth — no data dependency between
them. Run them in parallel (background curls, `&` + `wait`) to
cut wall time from sequential ~2s to ~1s.

### 1. Discover the live API shape

These endpoints are Beta — paths, params, and JSON field names
can shift. Follow `rules/openapi-discovery.md` to:

1. Fetch the OpenAPI spec from `https://api.clickhouse.cloud/v1`.
2. Locate the two operations by `operationId`:
   - `postgresInstancePrometheusGet` (Prometheus tag)
   - `slowQueryPatternsGetList` (Postgres tag)
3. Resolve their path templates, required query parameters,
   and (for the slow-query endpoint) the response schema.
4. Build a session-scoped role map from the schema property
   descriptions: `{ semantic role → actual field name }`.

Use the resolved names in every subsequent request and citation.
Never hardcode field names from memory.

### 2. Scrape Prom once for system gauges

Follow `rules/prometheus-scrape.md`. **One scrape, no wait.**
You're after gauges (current values) that don't need a delta:
`CacheHitRatio`, `ActiveConnections`, `MemoryUsedPercent`,
`FilesystemUsedPercent`.

A `CacheHitRatio` well below ~95% on a workload that should
fit in cache is a real signal on its own. Climbing
`ActiveConnections` toward the pool ceiling is a real signal
on its own. These don't need rate-of-change.

A second scrape for counter deltas is **opt-in**, used only
when Step 4 triage points at write-congestion (where deadlock
and rollback *rates* matter and the Slow Query Patterns API
can't substitute). For the read-path case (the most common
RCA shape) the single scrape is enough.

### 3. Pull top slow query patterns

Request the slow query patterns. Follow
`rules/slow-query-patterns-fields.md` for the fields that
matter and how to read them. This is the primary diagnostic —
it returns per-pattern accumulated totals (call count, runtime,
blocks, rows) over the window you request, which is the
"rate-of-change" data you'd otherwise derive from two Prom
scrapes — but per query and without waiting.

If no patterns return a meaningful `totalDurationUs`, the
report may be overstated or the issue isn't query-shaped.
Stop and tell the user what you looked at.

### 4. Triage: pick the right heuristic

Follow `rules/triage.md`. Match the combined Prom + slow-query
signal to one of the heuristic shapes. Each shape points to a
specific heuristic file:

- `rules/heuristic-full-scan.md` — read-path full scan.
- `rules/heuristic-hot-loop.md` — N+1 / hot loop from the app.
- `rules/heuristic-write-congestion.md` — deadlocks, slow
  writes, high rollback rate.

If the signal does not match any shape cleanly, do not invent
a hypothesis. Surface the top patterns and ask the user which
workload they recognize. New heuristics are welcome as PRs.

### 5. Reason, then recommend

Use the format in `rules/output-template.md`. Always include:
symptom, evidence, hypothesis (noting any alternative cause
you cannot rule out from this surface alone), short-term fix,
and long-term follow-ups.

### 6. Do not apply the fix

Follow `rules/recommend-only.md`. Never run DDL. Never call
`pg_cancel_backend` or `pg_terminate_backend`. Write the
recommendation, explain why, and let the human apply it.

## Full Compiled Document

For the complete guide with every rule expanded in a single
context load: `AGENTS.md`.
