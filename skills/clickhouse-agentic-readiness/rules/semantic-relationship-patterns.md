---
title: Consistent Foreign Key Naming Patterns
impact: HIGH
impactDescription: "Consistent *_id naming conventions let agents infer JOIN relationships without a schema diagram"
tags: [semantic, relationships, joins]
---

## Consistent Foreign Key Naming Patterns

**Impact: HIGH** — ClickHouse has no foreign key constraints, so an agent must infer relationships from naming conventions. When `orders.user_id` matches `users.id` (or `users.user_id`), an agent can confidently generate JOINs. Inconsistent patterns (`orders.uid`, `users.user_id`) or missing conventions force the agent to guess or ask for help.

**Diagnostic Query:**

```sql
-- Find *_id columns, check if matching tables exist, and surface descriptions
SELECT
    c.database,
    c.table,
    c.name AS id_column,
    c.type,
    c.comment AS column_comment,
    -- Extract the implied table name (remove _id suffix)
    replaceRegexpOne(c.name, '_id$', '') AS implied_table,
    t.name IS NOT NULL AS matching_table_exists,
    t.comment AS target_table_comment
FROM system.columns c
LEFT JOIN system.tables t
    ON (t.name = replaceRegexpOne(c.name, '_id$', '')
        OR t.name = replaceRegexpOne(c.name, '_id$', '') || 's')  -- plural form
    AND t.database = c.database
WHERE c.database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND c.name LIKE '%_id'
  AND c.name != 'id'
ORDER BY c.database, c.table, c.name;
-- Column comments on FK columns (e.g., "References users.user_id") and
-- target table comments help agents confirm relationship semantics
```

```sql
-- Find id columns shared across tables (potential join keys)
SELECT
    name,
    groupArray(database || '.' || table) AS found_in_tables,
    count() AS table_count
FROM system.columns
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND name LIKE '%_id'
GROUP BY name
HAVING table_count > 1
ORDER BY table_count DESC;
```

**Passing Condition:**
- `*_id` columns exist with consistent naming across tables
- ID columns in related tables share the same name and type
- Most `*_id` columns can be mapped to a corresponding table

**Warning Condition:**
- Some `*_id` conventions exist but are inconsistent (e.g., `user_id` in one table, `uid` in another), OR
- Naming is inconsistent but column comments document the relationship target (e.g., `uid` has comment "Foreign key to users.user_id")

**Failing Condition:**
- No discernible relationship patterns, `*_id` columns have mismatched types across tables, and no column or table comments document relationships

**Remediation:**

```sql
-- Standardize FK naming: use {entity}_id consistently
-- If orders has 'uid' but users has 'user_id', add an alias column or comment:
ALTER TABLE db.orders COMMENT COLUMN uid 'Foreign key to users.user_id (legacy name)';

-- For new tables, follow the convention:
-- {entity_singular}_id → references {entity_singular}s table
-- user_id  → users table
-- order_id → orders table
-- product_id → products table

-- Consider creating a dictionary for frequently joined dimension tables
CREATE DICTIONARY db.users_dict (
    user_id UInt64,
    user_name String,
    user_tier LowCardinality(String)
) PRIMARY KEY user_id
SOURCE(CLICKHOUSE(TABLE 'users'))
LIFETIME(300)
LAYOUT(HASHED());

-- Then agents can use dictGet() instead of JOIN
-- SELECT dictGet('db.users_dict', 'user_name', user_id) FROM orders
```

Reference: [Dictionaries](https://clickhouse.com/docs/sql-reference/dictionaries)
