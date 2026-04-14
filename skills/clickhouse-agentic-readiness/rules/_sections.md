# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

---

## 1. Schema Discoverability (discover)

**Impact:** CRITICAL
**Weight:** 25/100

**Description:** An agent's first task is understanding what data exists and what it means. Table and column comments, logical database organization, and consistent naming conventions determine whether an agent can autonomously navigate the schema or requires human guidance at every step. This is the highest-leverage category — even perfect performance tuning is useless if the agent can't find or understand the right tables.

## 2. Semantic Clarity (semantic)

**Impact:** CRITICAL
**Weight:** 25/100

**Description:** Beyond discoverability, an agent must correctly interpret what columns mean. Self-documenting column names, proper use of Enum and LowCardinality types for categorical data, and consistent relationship patterns (`*_id` conventions) let an agent generate correct queries without external documentation. Type-name mismatches (e.g., a `*_date` column stored as String) are a leading cause of agent query errors.

## 3. Query Safety & Guardrails (safety)

**Impact:** HIGH
**Weight:** 20/100

**Description:** An autonomous agent must not be able to harm the deployment. Read-only access, resource quotas, execution time limits, and memory caps ensure that even malformed agent queries cannot disrupt production workloads. Without guardrails, a single agent-generated cross-join or unfiltered scan can consume all cluster resources.

## 4. Performance Predictability (perf)

**Impact:** HIGH
**Weight:** 15/100

**Description:** Agents generate exploratory queries that may not perfectly align with table design. Well-designed ORDER BY keys, appropriate partitioning, materialized views for common aggregation patterns, and data skipping indices provide multiple paths to reasonable query performance. Without these, agent queries default to expensive full scans.

## 5. Pipeline & Data Freshness (pipeline)

**Impact:** MEDIUM
**Weight:** 10/100

**Description:** An agent analyzing stale or unhealthy data produces misleading results. Regular insert activity confirms data is live, healthy part counts indicate the merge process is keeping up, and TTL policies communicate data retention boundaries. These signals help an agent qualify the recency and completeness of its analysis.

## 6. Access Control Readiness (access)

**Impact:** MEDIUM
**Weight:** 5/100

**Description:** A dedicated agent user with a tailored settings profile enables audit trails, targeted resource limits, and separation from human workloads. While functional access may exist through shared credentials, proper access control is essential for production agent deployments.
