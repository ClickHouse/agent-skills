---
title: Dedicated Agent User or Role
impact: HIGH
impactDescription: "A dedicated agent user enables audit trails, targeted resource limits, and isolation from human workloads"
tags: [access, user, rbac]
---

## Dedicated Agent User or Role

**Impact: HIGH** — Using shared credentials (like `default`) for agent access makes it impossible to distinguish agent queries from human queries in audit logs, apply agent-specific resource limits, or revoke agent access without affecting other users. A dedicated user/role is essential for production agent deployments.

**Diagnostic Query:**

```sql
-- User inventory
SELECT
    name,
    storage,
    auth_type,
    host_ip,
    host_names
FROM system.users
ORDER BY name;
```

```sql
-- Role inventory and assignments
SELECT
    granted_role_name,
    user_name,
    role_name
FROM system.role_grants
ORDER BY granted_role_name;
```

```sql
-- Check for agent-like user names
SELECT
    name
FROM system.users
WHERE name LIKE '%agent%'
   OR name LIKE '%bot%'
   OR name LIKE '%ai%'
   OR name LIKE '%reader%'
   OR name LIKE '%analyst%'
ORDER BY name;
```

**Passing Condition:**
- A dedicated user exists for agent workloads (identifiable by name)
- The user is assigned a specific role with appropriate grants
- The user has a settings profile applied

**Warning Condition:**
- A general-purpose read-only user exists that could serve as the agent user, but it's shared with other services

**Failing Condition:**
- Only `default` or admin-level users exist; no dedicated agent access

**Remediation:**

```sql
-- Create a dedicated agent role and user
CREATE ROLE IF NOT EXISTS agent_reader;
GRANT SELECT ON analytics.* TO agent_reader;
GRANT SELECT ON system.tables TO agent_reader;
GRANT SELECT ON system.columns TO agent_reader;
GRANT SELECT ON system.databases TO agent_reader;

CREATE USER IF NOT EXISTS analytics_agent
    IDENTIFIED BY 'strong_password_here'
    DEFAULT ROLE agent_reader
    SETTINGS PROFILE 'agent_profile';

GRANT agent_reader TO analytics_agent;
```

Reference: [Users and Roles](https://clickhouse.com/docs/guides/sre/user-management/configuring-access-control)
