---
title: Read-Only Role for Agent Access
impact: CRITICAL
impactDescription: "An agent must never modify data — without a read-only role, a single malformed agent query could corrupt or delete production data"
tags: [safety, rbac, readonly]
---

## Read-Only Role for Agent Access

**Impact: CRITICAL** — An autonomous agent generates SQL programmatically and may produce unexpected mutations (INSERT, ALTER, DROP) due to prompt injection, model errors, or hallucination. A read-only role at the ClickHouse level provides a hard guarantee that no agent query can modify data, regardless of application-layer safeguards.

**Diagnostic Query:**

```sql
-- Check for users/roles with readonly settings
SELECT
    name,
    storage
FROM system.users
ORDER BY name;
```

```sql
-- Check grants - look for SELECT-only patterns
SELECT
    user_name,
    role_name,
    access_type,
    database,
    table
FROM system.grants
WHERE user_name != '' OR role_name != ''
ORDER BY user_name, role_name, access_type;
```

```sql
-- Check for readonly setting in profiles
SELECT
    profile_name,
    name AS setting_name,
    value
FROM system.settings_profile_elements
WHERE name = 'readonly'
ORDER BY profile_name;
```

**Passing Condition:**
- A dedicated user or role exists with only SELECT grants, OR
- A settings profile with `readonly=1` or `readonly=2` is applied to an agent user

**Warning Condition:**
- A read-only user exists but also has SHOW, DESCRIBE, or other non-SELECT privileges (acceptable but worth noting)

**Failing Condition:**
- No read-only users or roles exist; only admin/default users with full privileges

**Remediation:**

```sql
-- Create a read-only role for agent access
CREATE ROLE IF NOT EXISTS agent_readonly;

-- Grant SELECT on specific databases
GRANT SELECT ON analytics.* TO agent_readonly;
GRANT SELECT ON default.* TO agent_readonly;

-- Allow system table access for schema discovery
GRANT SELECT ON system.tables TO agent_readonly;
GRANT SELECT ON system.columns TO agent_readonly;
GRANT SELECT ON system.databases TO agent_readonly;
GRANT SELECT ON system.data_skipping_indices TO agent_readonly;
GRANT SELECT ON system.parts TO agent_readonly;

-- Create the agent user
CREATE USER IF NOT EXISTS agent_user
    IDENTIFIED BY 'secure_password_here'
    DEFAULT ROLE agent_readonly
    SETTINGS readonly = 1;

-- Apply the role
GRANT agent_readonly TO agent_user;
```

Reference: [Access Control and Account Management](https://clickhouse.com/docs/guides/sre/user-management/configuring-access-control)
