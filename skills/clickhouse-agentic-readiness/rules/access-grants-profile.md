---
title: Settings Profile for Agent Queries
impact: MEDIUM
impactDescription: "Server-side settings profiles enforce limits independent of client — preventing agent misconfiguration from bypassing guardrails"
tags: [access, profile, settings]
---

## Settings Profile for Agent Queries

**Impact: MEDIUM** — Application-layer query limits can be bypassed by misconfiguration or bugs. A ClickHouse settings profile applied to the agent user enforces limits server-side: even if the agent client doesn't set `max_execution_time`, the profile ensures it's applied. This defense-in-depth approach is important for autonomous agents.

**Diagnostic Query:**

```sql
-- Settings profiles
SELECT * FROM system.settings_profiles
ORDER BY name;
```

```sql
-- Settings profile elements (the actual settings)
SELECT
    profile_name,
    name AS setting_name,
    value,
    min,
    max,
    readonly
FROM system.settings_profile_elements
ORDER BY profile_name, name;
```

```sql
-- Check which profiles are assigned to users/roles
SELECT
    user_name,
    role_name,
    granted_role_name,
    profile_name
FROM system.settings_profile_elements spe
RIGHT JOIN system.role_grants rg ON 1=0
ORDER BY profile_name;
```

**Passing Condition:**
- A settings profile exists with execution limits (time, memory, result size)
- The profile is applied to the agent user or role
- Critical settings are marked `readonly = 1` (preventing the client from overriding them)

**Warning Condition:**
- A profile exists but doesn't mark settings as readonly (agent client could override)

**Failing Condition:**
- No custom settings profiles exist

**Remediation:**

```sql
-- Create a comprehensive agent settings profile
CREATE SETTINGS PROFILE IF NOT EXISTS agent_profile
    SETTINGS
        readonly = 1,                              -- enforce read-only
        max_execution_time = 60 READONLY,          -- 60s max, non-overridable
        max_memory_usage = 10000000000 READONLY,   -- 10GB max
        max_result_rows = 1000000 READONLY,        -- 1M result rows
        max_rows_to_read = 5000000000 READONLY,    -- 5B scan limit
        max_bytes_before_external_group_by = 5000000000,
        max_bytes_before_external_sort = 5000000000,
        use_uncompressed_cache = 1,                -- help with repeated queries
        log_queries = 1                            -- ensure all agent queries are logged
    TO agent_reader;
```

Reference: [Settings Profiles](https://clickhouse.com/docs/operations/access-rights#settings-profiles-management)
