---
title: Match the combined Prometheus and slow-query signal to a heuristic, or surface and ask
impact: CRITICAL
tags:
  - triage
  - decision-tree
  - routing
  - rca
---

# Triage

A decision tree for picking the right heuristic. Run this
after scraping Prometheus and pulling slow query patterns, but
before applying any specific heuristic.

Field names below reference **roles** from your session's role
map (per `openapi-discovery.md`).

## Step 1 — Read system context from the single Prom scrape

From the gauges in `prometheus-scrape.md`:

- **`CacheHitRatio` well below ~95%** on a workload that
  should fit in cache → cache thrash, real signal on its own.
- **`ActiveConnections` near the pool ceiling** → client
  fan-out or stuck queries.
- **All gauges healthy** → the system is fine; whatever's slow
  is per-query, not system-wide. Move on to Step 2.

(Confirm Prom metric names against the live scrape; user-facing
docs are at
https://clickhouse.com/docs/cloud/managed-postgres/monitoring/metrics.)

Note: the per-pattern *rate-of-change* data you'd otherwise
derive from two Prom scrapes lives in Slow Query Patterns —
that's Step 2. You only need a second Prom scrape when this
step or Step 2 hints at write-congestion (see
`heuristic-write-congestion.md`).

## Step 2 — What does the slow query pattern shape look like?

Read the top 3 patterns by `<total_duration>` **after
filtering out CH Cloud internal probes** (see
`slow-query-patterns-fields.md` → "Expect ClickHouse Cloud
internal probes"). For each, look
at the relationship between `<call_count>`, `<avg_duration>`,
`<total_rows>`, and `<blocks_read_from_disk>` +
`<blocks_served_from_cache>`:

| Pattern shape | Likely cause | Apply heuristic |
|---|---|---|
| One pattern dominates; high `blks_touched_per_row`; low derived cache hit ratio | Full scan (missing or unused index) | `heuristic-full-scan.md` |
| One pattern dominates; huge `<call_count>`, tiny `<avg_duration>`, large `<total_duration>` | N+1 / hot loop in the app | `heuristic-hot-loop.md` |
| High `<avg_duration>`, low `<blocks_read_from_disk>` and `<blocks_served_from_cache>` per call | Likely waits/locks (this skill can't fully confirm) | Surface and ask user to check `pg_stat_activity` |
| Many patterns simultaneously slow; low derived cache hit ratio across them | Capacity / cache thrash | Surface as a capacity concern, not a per-query fix |
| Top patterns have `<db_operation>` of INSERT/UPDATE/DELETE with high `<total_wal_bytes>` | Write-path congestion | `heuristic-write-congestion.md` |

## Step 3 — If signal is ambiguous, do not invent

If no single pattern matches a row above, report the top three
with their key ratios and ask the user which one corresponds
to a workload they recognize. Do not pick a heuristic at
random.

## What this skill does NOT cover yet

- Replication lag.
- Schema bloat / autovacuum starvation.
- TLS/connection-pool misconfiguration.
- Specific query rewrites (the heuristics recommend
  indexes/batching, not query refactors).

If the signal points at one of the above, say so and surface
it rather than forcing a fit. New heuristics for these
patterns are welcome as PRs.
