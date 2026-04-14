---
title: Column Comments for Non-Obvious Fields
impact: CRITICAL
impactDescription: "Column comments eliminate agent guesswork — a commented schema reduces query generation errors by providing ground truth for column semantics"
tags: [discover, comments, columns]
---

## Column Comments for Non-Obvious Fields

**Impact: CRITICAL** — Column comments are the highest-value metadata for agent comprehension. An agent can often infer meaning from well-named columns (`user_id`, `created_at`), but columns like `status`, `type`, `flags`, `tier`, or domain-specific abbreviations are ambiguous without comments.

**Diagnostic Query:**

```sql
SELECT
    database,
    table,
    name,
    type,
    comment
FROM system.columns
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND comment = ''
ORDER BY database, table, position;
```

**Summary Query:**

```sql
SELECT
    database,
    table,
    count() AS total_columns,
    countIf(comment != '') AS commented,
    round(countIf(comment != '') / count() * 100, 1) AS comment_pct
FROM system.columns
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
GROUP BY database, table
ORDER BY comment_pct ASC;
```

**Passing Condition:**
- ≥70% of columns have comments
- All non-obvious columns (status codes, flags, domain abbreviations, calculated fields) have comments

**Warning Condition:**
- 30–69% of columns have comments, OR only obvious columns (IDs, timestamps) are uncommented

**Failing Condition:**
- <30% of columns have comments

**Remediation:**

```sql
-- Add column comments, prioritizing non-obvious fields
ALTER TABLE db.orders COMMENT COLUMN status 'Order lifecycle status: 1=pending, 2=confirmed, 3=shipped, 4=delivered, 5=cancelled';
ALTER TABLE db.orders COMMENT COLUMN tier 'Customer pricing tier at time of order: standard, premium, enterprise';
ALTER TABLE db.orders COMMENT COLUMN gmv 'Gross merchandise value in USD cents (divide by 100 for dollars)';
```

**Prioritization for Comment Coverage:**
1. Status/type/flag columns (highest ambiguity)
2. Calculated/derived columns (formula not obvious)
3. Domain-specific abbreviations
4. Columns with non-obvious units (cents vs dollars, seconds vs milliseconds)
5. Foreign keys to non-obvious tables

Reference: [ALTER TABLE COMMENT COLUMN](https://clickhouse.com/docs/sql-reference/statements/alter/comment)
