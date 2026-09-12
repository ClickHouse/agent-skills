---
title: Example structure for a full RCA report
impact: MEDIUM
tags:
  - output
  - reporting
  - template
  - rca
---

# Output template

Use this structure when a full RCA report is helpful. Adapt it to the user’s request; a focused follow-up need not repeat every section.

````markdown
## Symptom

<one or two sentences on what the Prometheus signal showed,
naming the specific metrics and the rate-of-change or value
that flagged the issue>

## Evidence

The dominant slow query pattern(s) from
`slowQueryPatternsGetList`:

```json
<the actual JSON object(s), trimmed to the fields that matter
for the heuristic you applied — typically call_count,
total_duration, avg_duration, total_rows, blocks_read_from_disk,
blocks_served_from_cache, query_text. Use the resolved actual
field names from your session's role map, not the role labels.>
```

Key derived values (if applicable to the heuristic):
- `blks_touched_per_row` = <number>
- `call_count` over the window = <number>
- derived cache hit ratio = <number>

## Hypothesis

<the heuristic you matched (e.g., full scan, hot loop, write
congestion) and the most likely underlying cause. If the
heuristic cannot distinguish between two causes from this
surface alone, state both and explain what would
distinguish them.>

## Recommended action

<the concrete fix. For an index recommendation:>

```sql
CREATE INDEX CONCURRENTLY <descriptive_name>
  ON <table> (<cols>) [WHERE <predicate>];
```

<For an application-side fix: a specific code/query change to
make, e.g. "batch the loop into a single SELECT with
`WHERE id = ANY($1)`".>

<For a configuration/operational concern: the specific check
or follow-up the user should run, e.g. "check Postgres logs
for `deadlock detected` entries to see the conflicting
statements".>

One sentence on why this action addresses the diagnosed cause.

## Long-term follow-ups

- <bullet — e.g., audit other unindexed filterable columns on
  the same table>
- <bullet — e.g., add a CI check that flags new ORM-generated
  per-row queries>

````

## Style rules

- Quote real values from the API response, not hand-waved
  numbers.
- For DDL recommendations, default to `CREATE INDEX
  CONCURRENTLY` when minimizing write blocking is required; describe its operational constraints rather than claiming it takes no locks.
- For application-side recommendations, be specific about
  what to inspect in the codebase; use available code evidence rather than assuming it is inaccessible.
- If you cannot fully diagnose from the data available, say
  so. Surface what you saw and ask for the missing piece
  rather than overreaching.
