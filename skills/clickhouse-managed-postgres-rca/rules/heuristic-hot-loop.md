---
title: Diagnose an application-side N+1 / hot loop from high call count with low per-call latency
impact: HIGH
tags:
  - heuristic
  - hot-loop
  - n-plus-one
  - application
---

# Heuristic: hot loop (N+1)

**Use when** the triage decision tree pointed here: one pattern
has a very high `<call_count>` and a very low `<avg_duration>`,
but its `<total_duration>` is one of the largest on the
instance.

Field names reference **roles** from your session's role map
(per `openapi-discovery.md`). Substitute resolved actual names
when citing values.

## The shape

A pattern executing thousands of times per minute with a
sub-millisecond mean is the application calling the database
in a tight loop — typically:

- Rendering a list and issuing one query per row.
- A poorly batched job: per-record `SELECT` or `INSERT` where
  a single statement could handle many.
- A retry loop hammering a fast-but-pointless query.

The database is healthy here. The caller is the problem.

## Confirmation signals

Strong evidence:

- `<avg_duration>` < ~1 ms but `<call_count>` is in the tens
  of thousands over a short window.
- `<blocks_read_from_disk>` per call is small — the query is
  cheap; the issue is volume.
- The derived cache hit ratio is high on this pattern (it's
  hitting cache; it's just hitting it a lot).
- The `<query_text>` looks like a single-row lookup or small
  write: `SELECT ... WHERE id = $1`, `INSERT ... VALUES (...)`.

Weak/contraindicating evidence:

- High `<avg_duration>` — that's not a hot loop, that's a slow
  query at scale.
- Multiple patterns simultaneously elevated — broader load
  issue, not a single hot loop.

## Recommending a fix

The fix lives in the application, not the database. Be
specific about what to look for, since you can't see the app
code:

1. **Identify the caller.** Suggest the user grep app logs or
   tracing for the normalized `<query_text>`. The framework's
   ORM-generated queries usually have a distinctive shape.
2. **Batch the loop.** For reads: `SELECT ... WHERE id =
   ANY($1)` with the array of IDs. For writes: `INSERT ...
   VALUES (...), (...), (...)` or `COPY`.
3. **Cache where applicable.** If the same single-row lookup
   happens in a render loop, the app likely should be reading
   once and reusing.

## What NOT to recommend

- Indexes — `<avg_duration>` is small; there's probably already
  one. Adding more won't help.
- DB-side `statement_timeout` — papers over the loop.
- Connection pool tweaks — the loop is the cause, not the
  pool.
