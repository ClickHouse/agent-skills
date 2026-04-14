---
title: Part Count and Merge Health
impact: MEDIUM
impactDescription: "Tables with >300 active parts indicate merge pressure — agent queries on these tables will be slower and may hit 'too many parts' errors"
tags: [pipeline, parts, merge]
---

## Part Count and Merge Health

**Impact: MEDIUM** — Each active part in a MergeTree table is a separate set of files that must be read during queries. Tables with excessive active parts (>300) indicate the background merge process isn't keeping up, which causes slower queries, higher memory usage, and potential "too many parts" errors that would break agent workflows.

**Diagnostic Query:**

```sql
-- Tables with concerning part counts
SELECT
    database,
    table,
    count() AS active_parts,
    sum(rows) AS total_rows,
    formatReadableSize(sum(bytes_on_disk)) AS total_size,
    min(modification_time) AS oldest_part,
    max(modification_time) AS newest_part,
    max(level) AS max_merge_level
FROM system.parts
WHERE active
  AND database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
GROUP BY database, table
ORDER BY active_parts DESC;
```

```sql
-- Check for currently running merges
SELECT
    database,
    table,
    elapsed,
    progress,
    num_parts,
    formatReadableSize(total_size_bytes_compressed) AS size
FROM system.merges
ORDER BY elapsed DESC;
```

**Passing Condition:**
- All tables have <300 active parts
- No tables show growing part counts over time

**Warning Condition:**
- Some tables have 300–500 active parts but are actively merging (visible in system.merges)

**Failing Condition:**
- Tables with >500 active parts, OR tables hitting "too many parts" limits

**Remediation:**

```sql
-- Check insert patterns — high frequency small inserts cause part accumulation
-- Fix: Enable async inserts for the source pipeline
SET async_insert = 1;
SET wait_for_async_insert = 1;

-- If parts are already accumulated, a one-time OPTIMIZE can help
-- (but should NOT be a regular practice)
OPTIMIZE TABLE db.events FINAL;

-- Long-term fix: Ensure inserts batch 10K-100K rows per INSERT
-- See insert-batch-size rule in clickhouse-best-practices skill
```

Reference: [Parts](https://clickhouse.com/docs/operations/system-tables/parts)
