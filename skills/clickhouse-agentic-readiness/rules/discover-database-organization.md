---
title: Logical Database Organization
impact: HIGH
impactDescription: "Database grouping lets agents scope exploration by domain — without it, agents must scan all tables to find relevant ones"
tags: [discover, databases, organization]
---

## Logical Database Organization

**Impact: HIGH** — When all tables live in the `default` database, an agent must evaluate every table to determine relevance. Logical database grouping (e.g., `analytics`, `raw`, `staging`, `dim`) lets an agent immediately scope its exploration to a relevant domain.

**Diagnostic Query:**

```sql
SELECT
    name,
    engine,
    comment,
    comment != '' AS has_comment
FROM system.databases
WHERE name NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema', 'default')
ORDER BY name;
```

```sql
-- Tables per database
SELECT
    database,
    count() AS table_count,
    groupArray(name) AS tables
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND engine NOT IN ('MaterializedView', 'View')
GROUP BY database
ORDER BY table_count DESC;
```

**Passing Condition:**
- Multiple user databases exist with descriptive names
- Tables are logically grouped (not all in `default`)
- Database comments explain the domain/purpose

**Warning Condition:**
- Multiple databases exist but without comments, OR most tables are in `default` with only a few in other databases

**Failing Condition:**
- All user tables are in the `default` database with no organizational structure

**Remediation:**

```sql
-- Create domain-specific databases with comments
CREATE DATABASE IF NOT EXISTS analytics COMMENT 'Pre-aggregated analytics tables for dashboards and reporting';
CREATE DATABASE IF NOT EXISTS raw COMMENT 'Raw ingestion tables from source systems, minimally transformed';
CREATE DATABASE IF NOT EXISTS staging COMMENT 'Intermediate transformation tables, not for direct querying';

-- Move tables (requires recreation)
-- CREATE TABLE analytics.daily_metrics AS raw.events ENGINE = ...
-- INSERT INTO analytics.daily_metrics SELECT ... FROM raw.events
```

Reference: [CREATE DATABASE](https://clickhouse.com/docs/sql-reference/statements/create/database)
