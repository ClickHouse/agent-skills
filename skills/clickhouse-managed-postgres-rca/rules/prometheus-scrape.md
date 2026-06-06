---
title: Scrape the Prometheus endpoint for system-level gauges, opt into a second scrape only for counter deltas
impact: HIGH
tags:
  - prometheus
  - metrics
  - gauges
  - scrape
  - rca
---

# Prometheus scrape

## How

Use the path resolved during OpenAPI discovery
(`postgresInstancePrometheusGet`). HTTP Basic with the user's
ClickHouse Cloud API key/secret.

```bash
curl -s -u "$CH_CLOUD_KEY:$CH_CLOUD_SECRET" \
  "https://api.clickhouse.cloud/<resolved path>" > /tmp/pg-prom.txt
```

The response is Prometheus exposition format text (lines like
`PostgresServer_X{...} <value>`).

## Default: one scrape, gauges only

The skill's default Prom step is **a single scrape** that
extracts current values from gauges. No wait, no second scrape.
The Slow Query Patterns API gives the per-pattern rate-of-change
data — see `slow-query-patterns-fields.md` — so the only role
left for Prom is system-level context.

Gauges to read on the single scrape:

- `PostgresServer_CacheHitRatio` — current ratio. Below ~95%
  on a workload that should fit in cache = cache thrash.
- `PostgresServer_ActiveConnections` — current count (often
  split by `state` label: active / idle / idle in transaction).
  Climbing toward a known pool ceiling = client fan-out or
  stuck queries.
- `PostgresServer_MemoryUsedPercent` — current. Helps qualify
  cache hit ratio (low memory usage but bad hit ratio = the
  workload is bigger than RAM).
- `PostgresServer_FilesystemUsedPercent` — current. High =
  storage pressure, separate concern from query latency.

## Opt-in: rate-of-change from two scrapes

Only do a second scrape when Step 4 triage hints at write
congestion or you need a signal that's nowhere else:

- `PostgresServer_Deadlocks_Total` — non-zero delta means
  lock-cycle deadlocks: Postgres detected a circular lock wait
  and aborted one transaction to break it. This is **not** the
  same as a serialization conflict (SQLSTATE 40001 under
  `SERIALIZABLE` / `REPEATABLE READ`) — different mechanism,
  different fix (consistent lock ordering vs. retry/isolation
  review). See sub-patterns A and C in
  `heuristic-write-congestion.md`. Not surfaced in Slow Query
  Patterns.
- `PostgresServer_TransactionsRolledBack_Total` vs
  `_Committed_Total` — rollback rate; also not directly in
  Slow Query Patterns.
- `PostgresServer_DiskWrites_Total` — global write pressure
  (useful for sub-pattern B / WAL congestion in
  `heuristic-write-congestion.md`).

When doing the second scrape, the upstream collector refreshes
exposed values **roughly once per minute** (verified
empirically, May 2026 — not stated in the docs). A gap shorter
than ~60s returns identical counter values. **Use ≥90s, 120s
is the safe default.** If your delta on every counter is zero
despite live traffic, suspect that you scraped within one
refresh window.

```bash
curl -s -u "$CH_CLOUD_KEY:$CH_CLOUD_SECRET" \
  "https://api.clickhouse.cloud/<resolved path>" > /tmp/pg-prom-1.txt
sleep 120
curl -s -u "$CH_CLOUD_KEY:$CH_CLOUD_SECRET" \
  "https://api.clickhouse.cloud/<resolved path>" > /tmp/pg-prom-2.txt
```

Document the gap you used so a reader can sanity-check.

## What this surface does NOT show

No per-query metrics. No scan-type counters. No
autovacuum/analyze timestamps. No load averages. The
per-query story lives in Slow Query Patterns.

## Field name caveat

Metric names listed above match the user-facing docs at
https://clickhouse.com/docs/cloud/managed-postgres/monitoring/metrics.
Confirm exact casing in the actual scrape output on first
use; the API is Beta and names may shift.
