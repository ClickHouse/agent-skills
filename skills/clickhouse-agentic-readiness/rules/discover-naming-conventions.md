---
title: Consistent and Descriptive Naming Conventions
impact: HIGH
impactDescription: "Inconsistent or opaque names force agents to guess column meaning — abbreviations like 'amt', 'qty', 'sts' are ambiguous without context"
tags: [discover, naming, conventions]
---

## Consistent and Descriptive Naming Conventions

**Impact: HIGH** — An agent interprets column names as its primary signal for understanding data semantics. Names like `c1`, `val`, `tmp`, `f1`, or inconsistent abbreviations (`amt` vs `amount`, `qty` vs `quantity`) introduce ambiguity that leads to incorrect query generation.

**Diagnostic Query:**

```sql
-- Find suspiciously short or generic column names
SELECT
    database,
    table,
    name,
    type,
    comment
FROM system.columns
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND (
    length(name) <= 2
    OR name IN ('val', 'value', 'data', 'tmp', 'temp', 'col', 'field', 'x', 'y', 'z', 'v1', 'v2', 'v3')
    OR name LIKE 'col%' AND length(name) <= 5
    OR name LIKE 'f%' AND length(name) <= 3 AND name NOT LIKE 'fk%'
  )
ORDER BY database, table, name;
```

```sql
-- Check naming style consistency (snake_case vs camelCase vs other)
SELECT
    database,
    table,
    name,
    multiIf(
        match(name, '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'), 'snake_case',
        match(name, '^[a-z][a-zA-Z0-9]*$'), 'camelCase',
        match(name, '^[A-Z][a-zA-Z0-9]*$'), 'PascalCase',
        'other'
    ) AS naming_style
FROM system.columns
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
ORDER BY database, table, position;
```

**Passing Condition:**
- No single/double-letter column names (except well-known conventions like `id`)
- Consistent naming style across tables (all snake_case or all camelCase)
- No generic names like `val`, `data`, `tmp`

**Warning Condition:**
- Mixed naming styles across tables but consistent within each table, OR a few generic names that have clarifying comments

**Failing Condition:**
- Multiple opaque column names with no comments, OR inconsistent naming within single tables

**Remediation:**

Unfortunately, column renaming in ClickHouse requires table recreation. The practical remediation is to add comments to opaque columns:

```sql
-- If renaming is not feasible, add comments to clarify
ALTER TABLE db.t COMMENT COLUMN v1 'Customer lifetime value in USD';
ALTER TABLE db.t COMMENT COLUMN sts 'Order status code: see status enum documentation';

-- For new tables, use descriptive names
-- Bad:  amt, qty, sts, dt, typ
-- Good: amount_usd, quantity, order_status, created_date, event_type
```

Reference: [Identifier naming](https://clickhouse.com/docs/sql-reference/syntax#identifiers)
