---
title: Per-Query Execution Limits
impact: HIGH
impactDescription: "Execution limits prevent individual runaway queries — an unfiltered scan of a billion-row table without limits can take minutes and block other workloads"
tags: [safety, limits, settings]
---

## Per-Query Execution Limits

**Impact: HIGH** — Agents frequently generate exploratory queries that may inadvertently scan entire tables (missing WHERE clauses, unoptimized JOINs). Per-query limits on execution time, memory, and result size provide a safety net that kills expensive queries before they impact the cluster.

**Diagnostic Query:**

```sql
-- Check which safety-relevant settings have been customized
SELECT
    name,
    value,
    changed,
    description
FROM system.settings
WHERE name IN (
    'max_execution_time',
    'max_memory_usage',
    'max_rows_to_read',
    'max_bytes_to_read',
    'max_result_rows',
    'max_result_bytes',
    'max_bytes_before_external_group_by',
    'max_bytes_before_external_sort',
    'max_rows_in_join',
    'max_bytes_in_join',
    'max_rows_to_group_by',
    'timeout_before_checking_execution_speed'
)
ORDER BY name;
```

```sql
-- Check if any settings profiles apply these limits
SELECT
    profile_name,
    name AS setting_name,
    value
FROM system.settings_profile_elements
WHERE name IN (
    'max_execution_time',
    'max_memory_usage',
    'max_rows_to_read',
    'max_result_rows'
)
ORDER BY profile_name, name;
```

**Passing Condition:**
- `max_execution_time` is set (recommended: 30–300 seconds for agent queries)
- `max_memory_usage` is set (recommended: proportional to available RAM, e.g., 10GB)
- `max_result_rows` is set (recommended: 100K–1M rows — agents rarely need more)
- These are applied via a settings profile to the agent user

**Warning Condition:**
- Some limits are set but not all three key ones (time, memory, result rows)

**Failing Condition:**
- No execution limits configured (all defaults = unlimited)

**Remediation:**

```sql
-- Create a settings profile for agent queries
CREATE SETTINGS PROFILE IF NOT EXISTS agent_profile
    SETTINGS
        max_execution_time = 60,              -- 60 second timeout
        max_memory_usage = 10000000000,       -- 10 GB memory limit
        max_result_rows = 1000000,            -- 1M row result cap
        max_rows_to_read = 5000000000,        -- 5B row scan cap
        max_bytes_before_external_group_by = 5000000000,  -- spill to disk at 5GB
        max_bytes_before_external_sort = 5000000000
    TO agent_readonly;
```

Reference: [Settings](https://clickhouse.com/docs/operations/settings/settings)
