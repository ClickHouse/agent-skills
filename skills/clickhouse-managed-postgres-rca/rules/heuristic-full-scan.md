---
title: Diagnose a read-path full scan from blocks-touched-per-row, recommend an index without overreaching
impact: HIGH
tags:
  - heuristic
  - full-scan
  - indexing
  - read-path
---

# Heuristic: full scan

**Use when** the triage decision tree pointed here: read-heavy
Prom signal + one slow query pattern dominates with high
`blks_touched_per_row` and a low derived cache hit ratio.

Field names below reference **roles**, not literal API
properties. Substitute the resolved actual names from your
session's role map (built per `openapi-discovery.md`).

## The ratio

For the candidate pattern:

    blks_touched_per_row =
      (<blocks_served_from_cache> + <blocks_read_from_disk>)
      / max(<total_rows>, 1)

A ratio in the hundreds or thousands per row returned is the
full-scan signature even without a plan.

**Use blocks _touched_ (hit + read), not just disk reads.** A
hot table fully cached still produces a high
`blks_touched_per_row` if every call scans it. Disk-only
thinking misses cache-resident full scans.

When you report numbers, cite the resolved field names from
your role map so the user can verify against their own API
response.

## What it cannot distinguish

Two causes look identical on this surface:

1. **Missing index** on the predicate / sort column(s).
2. **Existing index ignored** by the planner — stale stats, a
   type mismatch in the comparison, a function applied to the
   indexed column, or a non-sargable predicate.

You cannot tell them apart without seeing a plan. Flag both
possibilities in the recommendation.

## Recommending an index

If the user confirms there is no covering index, recommend:

```sql
CREATE INDEX CONCURRENTLY <descriptive_name>
  ON <table> (<predicate_cols>[, <order_cols> [ASC|DESC]])
  [WHERE <selectivity_predicate>];
```

Rules of thumb:

- **`CONCURRENTLY`, always.** Never block writes on a running
  instance. Note in the recommendation that this takes longer
  but doesn't lock.
- **Include the ORDER BY column.** If the query's `ORDER BY`
  matches, put it in the index in the right direction so the
  index can serve the sort.
- **Partial index when the predicate is highly selective.**

## Recommending an investigation (if an index already exists)

If the user reports a covering index already exists:

1. `EXPLAIN (ANALYZE, BUFFERS) <the slow query>` — confirm
   the planner is or isn't using the index.
2. If it isn't, check for: function on indexed column, type
   mismatch in the predicate, stale stats (`ANALYZE` the
   table), or a bad cost estimate.
