---
title: Enum Types for Categorical Data
impact: MEDIUM
impactDescription: "Enum types self-document valid values in the schema — agents can discover allowed values without querying data"
tags: [semantic, enum, categorical]
---

## Enum Types for Categorical Data

**Impact: MEDIUM** — When categorical data is stored as bare integers (e.g., `status Int8`), an agent has no way to know what values like `1`, `2`, `3` mean without external documentation. Enum types embed valid values directly in the schema: `Enum8('pending'=1, 'active'=2, 'cancelled'=3)` is self-documenting.

**Diagnostic Query:**

```sql
-- Find existing Enum usage
SELECT
    database,
    table,
    name,
    type
FROM system.columns
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND type LIKE 'Enum%'
ORDER BY database, table, name;
```

```sql
-- Find integer columns that might be categorical (names suggesting status/type/category)
-- Includes comment to check if value mappings are documented
SELECT
    database,
    table,
    name,
    type,
    comment,
    comment != '' AS has_comment
FROM system.columns
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND (name LIKE '%status%' OR name LIKE '%type%' OR name LIKE '%category%'
       OR name LIKE '%level%' OR name LIKE '%tier%' OR name LIKE '%grade%'
       OR name LIKE '%state%' OR name LIKE '%kind%' OR name LIKE '%mode%')
  AND (type LIKE 'Int%' OR type LIKE 'UInt%' OR type LIKE 'Nullable(Int%' OR type LIKE 'Nullable(UInt%')
ORDER BY has_comment ASC, database, table, name;
-- Uncommented integer categoricals sort first (highest priority)
```

```sql
-- Check table comments for references to value mappings or lookup tables
SELECT
    database,
    name,
    comment
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND comment != ''
  AND (comment LIKE '%enum%' OR comment LIKE '%status%' OR comment LIKE '%lookup%'
       OR comment LIKE '%mapping%' OR comment LIKE '%dictionary%')
ORDER BY database, name;
```

**Passing Condition:**
- Categorical columns use Enum types, OR
- Integer categorical columns have comments documenting valid values

**Warning Condition:**
- Some categorical columns use bare integers but have comments explaining the mapping

**Failing Condition:**
- Multiple status/type/category columns stored as integers with no Enum and no comments

**Remediation:**

```sql
-- Option 1: Use Enum type (preferred for agent readability)
-- Note: Requires table recreation or ALTER to change column type
ALTER TABLE db.orders MODIFY COLUMN status Enum8(
    'pending' = 1,
    'confirmed' = 2,
    'shipped' = 3,
    'delivered' = 4,
    'cancelled' = 5
);

-- Option 2: If Enum migration is not feasible, add a comment
ALTER TABLE db.orders COMMENT COLUMN status 'Order status: 1=pending, 2=confirmed, 3=shipped, 4=delivered, 5=cancelled';

-- Option 3: Create a dictionary for lookup
CREATE DICTIONARY db.order_status_dict (
    id UInt8,
    name String
) PRIMARY KEY id
SOURCE(CLICKHOUSE(TABLE 'order_status_lookup'))
LIFETIME(3600)
LAYOUT(FLAT());
```

Reference: [Enum Type](https://clickhouse.com/docs/sql-reference/data-types/enum)
