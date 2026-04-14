---
title: Column Name and Type Alignment
impact: CRITICAL
impactDescription: "Name-type mismatches cause agents to generate incorrect casts, filters, and aggregations — the most common source of agent query errors"
tags: [semantic, naming, types]
---

## Column Name and Type Alignment

**Impact: CRITICAL** — An agent uses column names to infer appropriate operations. A column named `created_date` stored as `String` will cause the agent to apply Date functions that fail or return wrong results. A column named `total_amount` stored as `String` will trigger numeric aggregations that error. These mismatches are the single most common source of agent-generated query failures.

**Diagnostic Query:**

```sql
-- Find columns where the name implies a different type than actual
-- Includes comment to check if the mismatch is documented
SELECT
    database,
    table,
    name,
    type,
    comment,
    comment != '' AS has_comment
FROM system.columns
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND (
    -- Date-like names that aren't date types
    ((name LIKE '%_date' OR name LIKE '%_at' OR name LIKE '%_time' OR name LIKE '%_timestamp')
      AND type NOT LIKE 'Date%' AND type NOT LIKE 'DateTime%'
      AND type NOT LIKE 'Nullable(Date%' AND type NOT LIKE 'LowCardinality(Nullable(Date%')
      AND type NOT IN ('String', 'LowCardinality(String)')  -- might be intentional date strings
    )
    -- Numeric-like names stored as strings
    OR ((name LIKE '%_count' OR name LIKE '%_amount' OR name LIKE '%_price'
         OR name LIKE '%_total' OR name LIKE '%_sum' OR name LIKE '%_avg'
         OR name LIKE '%_rate' OR name LIKE '%_ratio' OR name LIKE '%_pct'
         OR name LIKE '%_quantity' OR name LIKE '%_num')
      AND (type LIKE '%String%'))
    -- Boolean-like names that aren't boolean
    OR ((name LIKE 'is_%' OR name LIKE 'has_%' OR name LIKE 'can_%' OR name LIKE '%_enabled')
      AND type NOT IN ('Bool', 'UInt8', 'Nullable(UInt8)', 'Nullable(Bool)'))
  )
ORDER BY has_comment ASC, database, table, name;
-- Uncommented mismatches sort first (highest priority to fix)
```

**Table-Level Context Query:**

```sql
-- Check table comments for schema-wide type conventions that may explain mismatches
-- (e.g., "All timestamps stored as ISO-8601 strings per source system convention")
SELECT
    database,
    name,
    comment
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND comment != ''
  AND engine NOT IN ('MaterializedView', 'View', 'Dictionary')
ORDER BY database, name;
```

**Passing Condition:**
- No name-type mismatches detected
- Date-named columns use Date/DateTime types
- Numeric-named columns use numeric types
- Boolean-named columns use Bool or UInt8

**Warning Condition:**
- A few mismatches exist but are documented with column comments explaining why (e.g., "stored as String because source system sends ISO-8601 text"), OR
- Table-level comment explains a schema-wide type convention that covers the mismatches

**Failing Condition:**
- Multiple mismatches with no column or table comments explaining them, especially date-as-String or amount-as-String patterns

**Remediation:**

```sql
-- Fix type mismatches by creating a new table with correct types
-- and migrating data. For example, String dates to DateTime:

-- Option 1: Add a materialized column with the correct type
ALTER TABLE db.events ADD COLUMN created_at_dt DateTime
  MATERIALIZED parseDateTimeBestEffort(created_at);

-- Option 2: For new tables, use correct types from the start
CREATE TABLE db.events_v2 (
    created_at DateTime,          -- not String
    total_amount Decimal(18, 2),  -- not String
    is_active Bool                -- not String
) ENGINE = MergeTree() ...;
```

Reference: [Data Types](https://clickhouse.com/docs/sql-reference/data-types)
