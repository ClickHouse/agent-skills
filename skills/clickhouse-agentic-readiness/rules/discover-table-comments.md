---
title: Table Comments Present and Meaningful
impact: CRITICAL
impactDescription: "Without table comments, an agent cannot determine table purpose or grain without sampling data — adding minutes per table to discovery"
tags: [discover, comments, metadata]
---

## Table Comments Present and Meaningful

**Impact: CRITICAL** — Table comments are the single most efficient way for an agent to understand what a table contains, its grain (one row per what?), and its source system.

An agent encountering a table named `events` with no comment must run exploratory queries (SELECT *, DESCRIBE, sample aggregations) to infer purpose. A comment like "Clickstream events, one row per page view, sourced from Segment" eliminates this entirely.

**Diagnostic Query:**

```sql
SELECT
    database,
    name,
    engine,
    comment,
    comment != '' AS has_comment,
    total_rows,
    formatReadableSize(total_bytes) AS size
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND engine NOT IN ('MaterializedView', 'View', 'Dictionary')
ORDER BY database, name;
```

**Summary Query:**

```sql
SELECT
    count() AS total_tables,
    countIf(comment != '') AS tables_with_comments,
    round(countIf(comment != '') / count() * 100, 1) AS comment_pct
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND engine NOT IN ('MaterializedView', 'View', 'Dictionary');
```

**Passing Condition:**
- ≥80% of user tables have non-empty comments
- Comments describe purpose, grain, and/or source (not just the table name restated)

**Warning Condition:**
- 50–79% of tables have comments, OR comments exist but are trivial (e.g., just the table name)

**Failing Condition:**
- <50% of tables have comments

**Remediation:**

```sql
-- Add meaningful table comments describing purpose, grain, and source
ALTER TABLE db.events MODIFY COMMENT 'Clickstream events from Segment. Grain: one row per page_view event. Partitioned by month.';
ALTER TABLE db.users MODIFY COMMENT 'User dimension table from CRM. Grain: one row per user_id. Uses ReplacingMergeTree for SCD updates.';
```

**Comment Best Practices for Agent Readability:**
- **Purpose:** What business domain does this table serve?
- **Grain:** What does one row represent?
- **Source:** Where does the data come from?
- **Update pattern:** How frequently is it refreshed?

Reference: [ALTER TABLE MODIFY COMMENT](https://clickhouse.com/docs/sql-reference/statements/alter/comment)
