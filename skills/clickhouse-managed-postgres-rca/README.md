# ClickHouse Managed Postgres RCA Skill

A Claude skill for diagnosing performance issues on
ClickHouse-managed Postgres. Surfaces two API endpoints to the
agent and guides it through an evidence-based RCA loop:

- The Prometheus metrics endpoint
  (`postgresInstancePrometheusGet`) — system and workload
  signal.
- The Slow Query Patterns API (`slowQueryPatternsGetList`) —
  per-digest evidence.

The skill encodes a workflow: scrape Prom for stress signal,
pull top slow query patterns, triage the signal shape against
a small library of heuristics, and produce a structured
recommendation.

## v0.1 heuristic library

- **Full scan** — read-path patterns with high
  blocks-read-per-row.
- **Hot loop (N+1)** — patterns with very high call rate and
  very low per-call latency.
- **Write congestion** — deadlocks, slow writes, high
  rollback rate.

If the signal does not match any of these, the skill surfaces
what it saw and asks rather than inventing a hypothesis. New
heuristics are welcome as PRs.

## Recommend-only

The skill never issues DDL, never kills queries, never mutates
the instance. It writes the SQL (or app-side change) the human
should make and explains the reasoning.

Both APIs are currently in Beta. The skill resolves exact
paths and field names from the OpenAPI spec on first use, so
it remains correct as the surface evolves.
