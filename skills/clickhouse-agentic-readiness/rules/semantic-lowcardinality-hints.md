---
title: LowCardinality Signals Categorical Nature
impact: MEDIUM
impactDescription: "LowCardinality type tells agents a column has few distinct values — a strong hint for GROUP BY and filter candidates"
tags: [semantic, lowcardinality, categorical]
---

## LowCardinality Signals Categorical Nature

**Impact: MEDIUM** — Beyond its compression benefits, `LowCardinality(String)` is a semantic signal to an agent that a column has relatively few distinct values. This helps agents identify good candidates for GROUP BY, WHERE filters, and dimension columns without needing to run expensive `SELECT DISTINCT` or `uniq()` queries.

**Diagnostic Query:**

```sql
-- Current LowCardinality usage
SELECT
    database,
    table,
    name,
    type
FROM system.columns
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND type LIKE 'LowCardinality%'
ORDER BY database, table, name;
```

```sql
-- Find String columns that might benefit from LowCardinality
-- Includes comment to check if cardinality characteristics are documented
SELECT
    database,
    table,
    name,
    type,
    comment,
    comment != '' AS has_comment
FROM system.columns
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND type = 'String'
  AND (name LIKE '%_type' OR name LIKE '%_status' OR name LIKE '%_category'
       OR name LIKE '%_country' OR name LIKE '%_region' OR name LIKE '%_platform'
       OR name LIKE '%_source' OR name LIKE '%_channel' OR name LIKE '%_tier'
       OR name LIKE '%_env' OR name LIKE '%_level' OR name LIKE '%_method')
ORDER BY has_comment ASC, database, table, name;
```

**Passing Condition:**
- Categorical string columns use `LowCardinality(String)`
- The deployment shows awareness of the LowCardinality type (used on at least some tables)

**Warning Condition:**
- Some LowCardinality usage exists but obvious categorical columns still use plain String, OR
- Plain String categorical columns have comments indicating low cardinality (e.g., "~50 distinct values") which partially mitigates the lack of type signal

**Failing Condition:**
- No LowCardinality usage at all, categorical columns use plain String, and no column or table comments document cardinality characteristics

**Remediation:**

```sql
-- Convert String columns to LowCardinality where appropriate
ALTER TABLE db.events MODIFY COLUMN event_type LowCardinality(String);
ALTER TABLE db.events MODIFY COLUMN country LowCardinality(String);
ALTER TABLE db.events MODIFY COLUMN platform LowCardinality(String);

-- For new tables, use LowCardinality from the start
CREATE TABLE db.events (
    event_type LowCardinality(String),  -- signals: few distinct values, good for GROUP BY
    country LowCardinality(String),
    raw_payload String                   -- signals: high cardinality, not for grouping
) ENGINE = MergeTree() ORDER BY (event_type, country);
```

Reference: [LowCardinality](https://clickhouse.com/docs/sql-reference/data-types/lowcardinality)
