---
title: Apply Safety Limits to Agent-Generated Queries
impact: CRITICAL
impactDescription: "Unbounded agent queries can scan billions of rows and saturate cluster resources"
tags: [agent, safety, limits, timeout]
---

## Apply Safety Limits to Agent-Generated Queries

**Impact: CRITICAL**

Every agent-generated query must have explicit safety limits. A single unbounded query can scan billions of rows, consume all memory, or run for minutes.

**Non-negotiable rules:**

- ALWAYS use `LIMIT` to cap returned rows (default `LIMIT 1000`)
- ALWAYS bound scan size with `max_rows_to_read` or `max_bytes_to_read` — `LIMIT` alone does not prevent a full scan
- ALWAYS set `max_execution_time` (default 30)
- NEVER run `SELECT *` on large tables without `LIMIT` and scan caps
- NEVER query without filtering on sort key or partition key columns

**Incorrect:**

```sql
SELECT * FROM events WHERE user_id = '123'
```

**Correct:**

```sql
SELECT *
FROM events
WHERE event_date >= today() - 7 AND user_id = '123'
LIMIT 100
SETTINGS max_execution_time = 30,
         max_rows_to_read = 1000000000,
         timeout_before_checking_execution_speed = 0
```

**Recommended per-query settings:**

| Setting | Recommended | Effect |
|---------|-------------|--------|
| `max_rows_to_read` | 1e9 | Caps rows scanned before materialization — the real guardrail |
| `max_bytes_to_read` | 1e11 | Caps bytes scanned |
| `max_execution_time` | 30 | Interrupts query when projected execution time exceeds N seconds (see `timeout_before_checking_execution_speed`) |
| `timeout_before_checking_execution_speed` | 0 | Makes `max_execution_time` behave as a wall-clock limit (default `10` gives queries 10s of grace before timeouts kick in) |
| `max_estimated_execution_time` | 60 | Rejects queries whose projected runtime exceeds N seconds — kills expensive queries before they start |
| `max_result_rows` | 10000 | Caps output rows |
| `result_overflow_mode` | `'break'` | Returns partial result of ≥ `max_result_rows`, rounded up to the next block boundary (it does not truncate exactly) |

Limits are checked at block boundaries, so actual scans and runtime can overshoot slightly.

**Cloud vs self-hosted defaults that matter:**

| Setting | Self-hosted default | Cloud default |
|---------|---------------------|---------------|
| `max_memory_usage` | `0` (unlimited) | Depends on replica RAM — not unlimited |
| `max_bytes_before_external_group_by` | `0` (no spill) | Half the memory per replica — spills automatically |
| `max_bytes_before_external_sort` | `0` (no spill) | Half the memory per replica — spills automatically |
| `max_rows_to_read` / `max_bytes_to_read` | `0` (unlimited) | `0` (unlimited) — must be set explicitly on both |
| `max_execution_time` | `0` (unlimited) | `0` (unlimited) — must be set explicitly on both |

On self-hosted, GROUP BY and ORDER BY have no automatic memory ceiling — set the `max_bytes_before_external_*` settings explicitly or enforce via profile. On Cloud, GROUP BY / ORDER BY spill to disk automatically and per-query memory is bounded, but scan and execution-time caps are still your job.

**When things go wrong:**

- **Timeout** (`TIMEOUT_EXCEEDED`): Narrow the time range, add sort key filters, run `EXPLAIN ESTIMATE` to check scan size before retrying. Consider `max_estimated_execution_time` to reject expensive queries up front.
- **Memory error** (`MEMORY_LIMIT_EXCEEDED`): Reduce actual memory use — narrow filters, add `LIMIT`, lower GROUP BY cardinality, enable `max_bytes_before_external_group_by` (already on by default in Cloud, off on self-hosted), or split into smaller time windows. Raising `max_memory_usage` only helps if you're authorized and the ceiling is genuinely the problem; *lowering* it makes the error happen sooner, not later.
- **Too many parts** (`TOO_MANY_PARTS`): Back off inserts — merges are behind. Wait and retry.

**Role-level hardening (belt-and-suspenders):**

Per-query `SETTINGS` only applies if the agent remembers to emit it. For production, the primary mechanism should be a [settings profile](https://clickhouse.com/docs/operations/settings/settings-profiles) plus [`readonly=2`](https://clickhouse.com/docs/operations/settings/constraints-on-settings#read-only) on the agent's role, so limits apply even when the agent forgets. Per-query settings are then defense in depth, not the fence.

Per-query limits also don't stop abuse via many small queries — use [quotas](https://clickhouse.com/docs/operations/quotas) to bound requests or scanned bytes per interval.

**Progressive exploration pattern:**

Start narrow, widen only if needed:

```sql
-- 1. Count first (cheap)
SELECT count() FROM events WHERE event_date = today();

-- 2. Small sample (if count is reasonable)
SELECT * FROM events WHERE event_date = today() LIMIT 10;

-- 3. Full query with LIMIT and scan caps
SELECT user_id, count() as events
FROM events
WHERE event_date = today()
GROUP BY user_id
ORDER BY events DESC
LIMIT 100
SETTINGS max_execution_time = 30,
         max_rows_to_read = 1000000000,
         timeout_before_checking_execution_speed = 0;
```

Reference: [Query complexity restrictions](https://clickhouse.com/docs/operations/settings/query-complexity) · [Query-level settings](https://clickhouse.com/docs/operations/settings/query-level)
