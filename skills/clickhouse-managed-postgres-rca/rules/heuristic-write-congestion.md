---
title: Diagnose write-path congestion across deadlocks, slow writes, and high error rate sub-patterns
impact: HIGH
tags:
  - heuristic
  - write-path
  - deadlocks
  - wal
  - rollbacks
---

# Heuristic: write-path congestion

**Use when** the triage decision tree pointed here: top
patterns have `<db_operation>` of INSERT/UPDATE/DELETE with
large `<total_wal_bytes>`, or the user reports symptoms
(timeouts, retries) that this skill's per-pattern view alone
can't confirm.

This is the one heuristic that may need the **opt-in second
Prom scrape** (see `prometheus-scrape.md`) — specifically to
get a non-zero delta on `PostgresServer_Deadlocks_Total` and a
rollback/commit ratio from
`PostgresServer_TransactionsRolledBack_Total` vs
`_Committed_Total`. Neither is exposed in Slow Query Patterns.

Field names reference **roles** from your session's role map
(per `openapi-discovery.md`).

## The shape

Three sub-patterns live under "write congestion." Distinguish
before recommending.

### Sub-pattern A: deadlocks

`PostgresServer_Deadlocks_Total` delta > 0 over the window.
At least two concurrent transactions are taking locks in
incompatible orders.

**Recommend:**

- Surface the deadlock count and ask the user to check
  Postgres logs for `deadlock detected` entries — these log
  the exact statements involved, which the API doesn't.
- Common cause: two transactions update the same set of rows
  in different orders. Fix is application-side: lock rows in
  a consistent order (e.g., always sort by primary key
  before issuing updates).

### Sub-pattern B: slow individual writes

One write pattern with high `<avg_duration>`. Could be a wide
row insert under contention, a large update touching many
rows, or WAL congestion under heavy concurrent writes.

**Recommend:**

- For wide rows: check column count and TOAST-eligible
  fields. Consider whether some columns belong in a side
  table.
- For wide updates (high `<total_rows>` per call): batch into
  smaller chunks with explicit transactions, so each chunk
  commits separately.
- For concurrent-write pressure: surface `<total_wal_bytes>`.
  If high, the bottleneck is WAL flush — the user may need to
  tune `commit_delay` / `synchronous_commit` (with durability
  tradeoffs the user must own) or scale the instance.

### Sub-pattern C: high error rate

`<error_count>` is unusually large relative to `<call_count>`,
or `PostgresServer_TransactionsRolledBack_Total` delta is high
relative to commits.

**Recommend:**

- Application is throwing exceptions mid-transaction or
  hitting serialization conflicts on `SERIALIZABLE` /
  `REPEATABLE READ` isolation.
- Surface the error / rollback rate; ask the user to check
  app error logs for the actual exception traces — the API
  doesn't expose those.

## What NOT to recommend

- An index — write congestion is rarely indexed away. More
  indexes make writes slower.
- Vacuum tuning unless there's specific evidence of bloat —
  this surface doesn't expose bloat metrics, so don't guess.
- Hardware sizing — out of scope for a single-pattern RCA.
  Surface the WAL/commit pressure and recommend the user
  discuss with their account team.
