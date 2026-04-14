---
title: Rule Title Here
impact: CRITICAL | HIGH | MEDIUM | LOW
impactDescription: "Why this matters for agent autonomy"
tags: [section, specific-tags]
---

## Rule Title Here

**Impact: CRITICAL** (description)

Brief explanation of why this matters for an AI agent trying to autonomously explore and query the deployment.

**Diagnostic Query:**

```sql
-- Query to assess this rule
SELECT ... FROM system.tables ...
```

**Passing Condition:**
Description of what a good result looks like, with thresholds.

**Warning Condition:**
Description of what triggers a WARN (partial compliance).

**Failing Condition:**
Description of what indicates a problem.

**Remediation:**

```sql
-- How to fix: example DDL/configuration
ALTER TABLE t COMMENT COLUMN col 'description here';
```

Reference: [ClickHouse Docs](https://clickhouse.com/docs/...)
