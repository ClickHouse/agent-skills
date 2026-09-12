---
title: Bound Live Query Resource Use
impact: CRITICAL
impactDescription: "Result limits alone do not bound scans, aggregation memory, or execution time"
tags: [agent, safety, limits, timeout]
---

## Bound Live Query Resource Use

**Impact: CRITICAL**

For live exploration, use the deployment's approved execution, scan, memory, and result limits. Reuse enforced settings profiles; add per-query limits where needed. Choose budgets for the service and task rather than assuming one safe scan size for every cluster.

A LIMIT bounds returned rows, not necessarily scanned rows or aggregation work. A scalar aggregate does not need an artificial LIMIT. Preserve the requested result: a partition-key predicate is useful only if it is consistent with the question.

**Incorrect (assuming LIMIT makes a full aggregation cheap):**

```sql
SELECT user_id, count()
FROM events
GROUP BY user_id
ORDER BY count() DESC
LIMIT 10;
```

**Correct (bounded exploration with an explicitly requested time range):**

```sql
-- Illustrative budgets: adapt to the approved service limits.
SELECT user_id, count()
FROM events
WHERE event_date = today()
GROUP BY user_id
ORDER BY count() DESC
LIMIT 10
SETTINGS max_execution_time = 30,
         max_rows_to_read = 1000000,
         max_memory_usage = 1000000000,
         read_overflow_mode = 'throw',
         timeout_overflow_mode = 'throw';
```

**Limits and completeness:**

- Use EXPLAIN for potentially expensive plans. A count query is not automatically a cheap preflight.
- Check the effective settings on the target service; Cloud and self-managed profiles can differ.
- Prefer an error on budget exhaustion when a complete answer is required. Overflow modes that return partial results must be disclosed; never present a truncated aggregate as complete.
- Limits are checked during execution and can overshoot; they are not precise wall-clock or billing guarantees.
- Use bounded result samples for exploration. Exports may require streaming the full requested result rather than adding LIMIT.

**Recovery:**

On a timeout or memory error, inspect the cause and plan before retrying. Use an equivalent optimization, an explicitly agreed narrower scope, or a justified budget change within existing authorization. Do not silently narrow dates or increase limits. Stop repeated attempts that reproduce the same failure without new evidence.

Production access should use appropriately constrained database users, settings profiles, and quotas so resource limits do not depend on the model remembering every setting. Changing those controls is a separate administrative action, not part of answering a query.

Reference: [Query complexity restrictions](https://clickhouse.com/docs/operations/settings/query-complexity) · [Settings profiles](https://clickhouse.com/docs/operations/settings/settings-profiles) · [Quotas](https://clickhouse.com/docs/operations/quotas)
