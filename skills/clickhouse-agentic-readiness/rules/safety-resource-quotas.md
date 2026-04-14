---
title: Resource Quotas Configured
impact: HIGH
impactDescription: "Without quotas, a single agent session can exhaust cluster resources with repeated expensive queries"
tags: [safety, quotas, resources]
---

## Resource Quotas Configured

**Impact: HIGH** — Quotas limit the cumulative resource consumption of a user or role over a time interval. While per-query settings (max_execution_time) cap individual queries, quotas cap the total — preventing an agent from running hundreds of moderately expensive queries that collectively overwhelm the cluster.

**Diagnostic Query:**

```sql
-- Check configured quotas
SELECT * FROM system.quotas FORMAT Vertical;
```

```sql
-- Check current quota usage
SELECT
    quota_name,
    quota_key,
    duration,
    queries,
    max_queries,
    result_rows,
    max_result_rows,
    read_rows,
    max_read_rows
FROM system.quota_usage
FORMAT Vertical;
```

**Passing Condition:**
- At least one quota exists with meaningful limits (max_queries, max_read_rows, or max_result_rows)
- Quota is applied to the agent user or role

**Warning Condition:**
- Quotas exist but with very high limits that effectively don't constrain agent behavior

**Failing Condition:**
- No quotas configured at all

**Remediation:**

```sql
-- Create a quota for agent workloads
CREATE QUOTA IF NOT EXISTS agent_quota
    FOR INTERVAL 1 hour
        MAX queries = 1000,
        MAX result_rows = 10000000,
        MAX read_rows = 1000000000,
        MAX execution_time = 1800
    TO agent_readonly;
```

Reference: [Quotas](https://clickhouse.com/docs/operations/quotas)
