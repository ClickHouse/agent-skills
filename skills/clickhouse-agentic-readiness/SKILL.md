---
name: clickhouse-agentic-readiness
description: Use when assessing a ClickHouse deployment's readiness for autonomous AI agent analytics. Evaluates schema discoverability, semantic clarity, query safety, performance predictability, data freshness, and access control. Runs diagnostic SQL against system tables and produces a scored readiness report with prioritized remediation.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.1.0"
---

# ClickHouse Agentic Readiness Assessment

Assess whether a ClickHouse deployment is ready for autonomous AI agent analytics. Contains 20 rules across 6 categories, scored on a 100-point scale. Each rule includes diagnostic SQL queries to run against system tables and specific remediation steps.

> **Purpose:** An AI agent querying ClickHouse needs discoverable schemas, semantic clarity, safety guardrails, and predictable performance. This skill identifies gaps and provides a remediation roadmap.

## IMPORTANT: How to Apply This Skill

**This skill requires running SQL queries against a live ClickHouse deployment.** Follow this procedure:

1. **Establish connection** — Confirm you have access to the target ClickHouse instance (via clickhouse-client, HTTP, or MCP)
2. **Run diagnostic queries** from each section's rules against system tables
3. **Evaluate results** against passing/warning/failing thresholds defined in each rule
4. **Score each rule** as PASS (full points), WARN (half points), or FAIL (0 points)
5. **Produce the readiness scorecard** using the output format below
6. **Prioritize remediation** by impact level (CRITICAL first)

### Before You Start

Read the rule files for the relevant sections. If performing a full assessment, read all sections in order:

1. Schema Discoverability (`discover-*`) — CRITICAL
2. Semantic Clarity (`semantic-*`) — CRITICAL
3. Query Safety & Guardrails (`safety-*`) — HIGH
4. Performance Predictability (`perf-*`) — HIGH
5. Pipeline & Data Freshness (`pipeline-*`) — MEDIUM
6. Access Control Readiness (`access-*`) — MEDIUM

---

## Assessment Procedures

### Phase 1: Inventory (run first)

```sql
-- Q1: Table inventory with metadata completeness
SELECT
    database,
    name,
    engine,
    comment != '' AS has_comment,
    total_rows,
    formatReadableSize(total_bytes) AS size,
    sorting_key,
    partition_key
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
ORDER BY database, name;
```

```sql
-- Q2: Column comment coverage by table
SELECT
    database,
    table,
    count() AS total_columns,
    countIf(comment != '') AS commented_columns,
    round(countIf(comment != '') / count() * 100, 1) AS comment_pct
FROM system.columns
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
GROUP BY database, table
ORDER BY comment_pct ASC;
```

### Phase 2: Schema Discoverability (rules: discover-*)

**Read these rule files in order:**

1. `rules/discover-table-comments.md` — Table comment coverage
2. `rules/discover-column-comments.md` — Column comment coverage
3. `rules/discover-database-organization.md` — Logical database grouping
4. `rules/discover-naming-conventions.md` — Naming consistency

**Check for:**
- [ ] ≥80% of tables have meaningful comments
- [ ] ≥70% of columns have comments (especially non-obvious ones)
- [ ] Tables grouped into logical databases (not all in `default`)
- [ ] No opaque column names without clarifying comments

### Phase 3: Semantic Clarity (rules: semantic-*)

**Read these rule files:**

1. `rules/semantic-column-naming.md` — Name-type alignment
2. `rules/semantic-enum-usage.md` — Enum for categorical data
3. `rules/semantic-lowcardinality-hints.md` — LowCardinality signals
4. `rules/semantic-relationship-patterns.md` — FK naming conventions

**Check for:**
- [ ] Column names match their types (dates are Date, counts are numeric)
- [ ] Categorical data uses Enum or LowCardinality (not bare integers/strings)
- [ ] *_id columns consistently map to related tables

### Phase 4: Query Safety (rules: safety-*)

**Read these rule files:**

1. `rules/safety-readonly-role.md` — Read-only access exists
2. `rules/safety-resource-quotas.md` — Quotas configured
3. `rules/safety-execution-limits.md` — Per-query limits set

**Check for:**
- [ ] A read-only user/role exists for agent access
- [ ] Resource quotas limit cumulative consumption
- [ ] max_execution_time, max_memory_usage, max_result_rows configured

### Phase 5: Performance Predictability (rules: perf-*)

**Read these rule files:**

1. `rules/perf-orderby-design.md` — ORDER BY key quality
2. `rules/perf-partition-strategy.md` — Partition health
3. `rules/perf-mv-availability.md` — Materialized views present
4. `rules/perf-skipping-indices.md` — Secondary indices

**Check for:**
- [ ] MergeTree tables have multi-column ORDER BY keys
- [ ] Partition counts in healthy range (<1000)
- [ ] Materialized views exist for common aggregations
- [ ] Skipping indices on frequently filtered non-key columns

### Phase 6: Pipeline Health (rules: pipeline-*)

**Read these rule files:**

1. `rules/pipeline-insert-activity.md` — Data freshness
2. `rules/pipeline-part-health.md` — Part count health
3. `rules/pipeline-ttl-lifecycle.md` — TTL policies

**Check for:**
- [ ] Active tables show recent modification times
- [ ] No tables with >300 active parts
- [ ] Time-series tables have TTL policies

### Phase 7: Access Control (rules: access-*)

**Read these rule files:**

1. `rules/access-agent-user.md` — Dedicated agent user
2. `rules/access-grants-profile.md` — Settings profile applied

**Check for:**
- [ ] Dedicated agent user/role exists
- [ ] Settings profile with execution limits applied

---

## Scoring Methodology

| Category | Weight | Rules |
|----------|--------|-------|
| Schema Discoverability | 25/100 | 4 rules (6.25 pts each) |
| Semantic Clarity | 25/100 | 4 rules (6.25 pts each) |
| Query Safety & Guardrails | 20/100 | 3 rules (6.67 pts each) |
| Performance Predictability | 15/100 | 4 rules (3.75 pts each) |
| Pipeline & Data Freshness | 10/100 | 3 rules (3.33 pts each) |
| Access Control Readiness | 5/100 | 2 rules (2.5 pts each) |

**Per-rule scoring:**
- **PASS** = full points for that rule
- **WARN** = half points
- **FAIL** = 0 points

---

## Output Format

Structure your response as follows:

```
## Agentic Readiness Assessment

### Overall Score: X/100

| Category | Score | Status |
|----------|-------|--------|
| Schema Discoverability | X/25 | PASS / WARN / FAIL |
| Semantic Clarity | X/25 | PASS / WARN / FAIL |
| Query Safety & Guardrails | X/20 | PASS / WARN / FAIL |
| Performance Predictability | X/15 | PASS / WARN / FAIL |
| Pipeline & Data Freshness | X/10 | PASS / WARN / FAIL |
| Access Control Readiness | X/5 | PASS / WARN / FAIL |

### Detailed Findings

#### Schema Discoverability (X/25)
- **`discover-table-comments`**: [PASS/WARN/FAIL] — X% of tables have comments
  - Evidence: [query result summary]
  - Recommendation: [if applicable]
- **`discover-column-comments`**: [PASS/WARN/FAIL] — X% coverage
  ...

#### [Repeat for each category]

### Priority Remediation Plan
1. [CRITICAL] [Highest impact action]
2. [CRITICAL] [Next highest]
3. [HIGH] ...
...
```

---

## Rule Categories by Priority

| Priority | Category | Impact | Prefix | Rule Count |
|----------|----------|--------|--------|------------|
| 1 | Schema Discoverability | CRITICAL | `discover-` | 4 |
| 2 | Semantic Clarity | CRITICAL | `semantic-` | 4 |
| 3 | Query Safety & Guardrails | HIGH | `safety-` | 3 |
| 4 | Performance Predictability | HIGH | `perf-` | 4 |
| 5 | Pipeline & Data Freshness | MEDIUM | `pipeline-` | 3 |
| 6 | Access Control Readiness | MEDIUM | `access-` | 2 |

---

## Quick Reference

### Schema Discoverability (CRITICAL)

- `discover-table-comments` — Table comment coverage (≥80% target)
- `discover-column-comments` — Column comment coverage (≥70% target)
- `discover-database-organization` — Logical database grouping
- `discover-naming-conventions` — Consistent, descriptive column names

### Semantic Clarity (CRITICAL)

- `semantic-column-naming` — Column name and type alignment
- `semantic-enum-usage` — Enum types for categorical data
- `semantic-lowcardinality-hints` — LowCardinality signals categorical nature
- `semantic-relationship-patterns` — Consistent *_id naming for JOINs

### Query Safety & Guardrails (HIGH)

- `safety-readonly-role` — Read-only role for agent access
- `safety-resource-quotas` — Cumulative resource quotas
- `safety-execution-limits` — Per-query time, memory, and result limits

### Performance Predictability (HIGH)

- `perf-orderby-design` — Meaningful ORDER BY key design
- `perf-partition-strategy` — Healthy partition counts
- `perf-mv-availability` — Materialized views for common patterns
- `perf-skipping-indices` — Data skipping indices for non-key filters

### Pipeline & Data Freshness (MEDIUM)

- `pipeline-insert-activity` — Regular insert activity and data freshness
- `pipeline-part-health` — Part count and merge health
- `pipeline-ttl-lifecycle` — TTL policies for data lifecycle

### Access Control Readiness (MEDIUM)

- `access-agent-user` — Dedicated agent user or role
- `access-grants-profile` — Settings profile for agent queries

---

## When to Apply

This skill activates when you encounter:

- "Is this ClickHouse ready for an AI agent?"
- "Assess agentic readiness"
- "Evaluate schema discoverability"
- "Can an agent query this deployment safely?"
- "Agent-friendly deployment check"
- "Agentic analytics readiness"
- "How discoverable is my schema?"
- "Check if my ClickHouse is ready for autonomous analytics"
- Requests to evaluate a ClickHouse deployment for AI/LLM/agent use

---

## Rule File Structure

Each rule file in `rules/` contains:

- **YAML frontmatter**: title, impact level, impactDescription, tags
- **Explanation**: Why this matters for agent autonomy
- **Diagnostic Query**: SQL to run against system tables
- **Passing/Warning/Failing Conditions**: Thresholds for scoring
- **Remediation**: DDL or configuration to fix issues

---

## Full Compiled Document

For the complete guide with all rules expanded inline: `AGENTS.md`

Use `AGENTS.md` when you need to check multiple rules quickly without reading individual files.
