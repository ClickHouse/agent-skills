---
name: clickhouse-best-practices
description: MUST USE when reviewing ClickHouse schemas, queries, or configurations. Contains 49 rules that MUST be checked before providing recommendations. Always read relevant rule files and cite specific rules in responses.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.5.0"
---

# ClickHouse Best Practices

Comprehensive guidance for ClickHouse covering schema design, query optimization, data ingestion, and AI agent connectivity. Contains 49 rules across 4 main categories (schema, query, insert, agent), prioritized by impact. Diagnostic rules cover reading evidence from a live service: system tables, stuck mutations, TOO_MANY_PARTS, memory errors, and data that looks duplicated or missing.

> **Official docs:** [ClickHouse Best Practices](https://clickhouse.com/docs/best-practices)

## IMPORTANT: How to Apply This Skill

**Before answering ClickHouse questions, follow this priority order:**

1. **Check for applicable rules** in the `rules/` directory
2. **If rules exist:** Apply them and cite them in your response using "Per `rule-name`..."
3. **If no rule exists:** Use the LLM's ClickHouse knowledge or search documentation
4. **If uncertain:** Use web search for current best practices
5. **Always cite your source:** rule name, "general ClickHouse guidance", or URL

**Why rules take priority:** ClickHouse has specific behaviors (columnar storage, sparse indexes, merge tree mechanics) where general database intuition can be misleading. The rules encode validated, ClickHouse-specific guidance.

---

## Agent Connectivity & Query Workflow

Before querying ClickHouse, agents must establish a connection and follow the discovery workflow:

1. `rules/agent-connect-mcp.md` - Connection setup (MCP + CLI), credential discovery, output format selection
2. `rules/agent-discovery-schema.md` - **CRITICAL**: 7-step schema discovery workflow
3. `rules/agent-query-safety.md` - **CRITICAL**: LIMIT, timeouts, progressive exploration

**Every agent session should follow this sequence:**

1. **Connect** — establish connection via MCP or CLI (see `agent-connect-mcp`)
2. **Discover** — databases → tables → columns + comments → sort keys → skip indexes → sample → EXPLAIN
3. **Plan** — use sort key and skip index knowledge to write efficient WHERE clauses
4. **Execute** — run queries with LIMIT and timeouts
5. **Recover** — on timeout/memory errors, narrow filters and retry (see `agent-query-safety`)

### Subagent architecture notes

If your system dispatches ClickHouse tasks to specialized subagents:
- **Schema discovery + query execution**: any model — the steps are procedural
- **EXPLAIN analysis + query optimization**: benefits from mid-tier reasoning
- **Schema design review against all 28 rules**: benefits from mid-tier reasoning

---

## Review Procedures

### For Schema Reviews (CREATE TABLE, ALTER TABLE)

**Read these rule files in order:**

1. `rules/schema-pk-plan-before-creation.md` - ORDER BY is immutable
2. `rules/schema-pk-cardinality-order.md` - Column ordering in keys
3. `rules/schema-pk-prioritize-filters.md` - Filter column inclusion
4. `rules/schema-types-native-types.md` - Proper type selection
5. `rules/schema-types-minimize-bitwidth.md` - Numeric type sizing
6. `rules/schema-types-lowcardinality.md` - LowCardinality usage
7. `rules/schema-types-avoid-nullable.md` - Nullable vs DEFAULT
8. `rules/schema-partition-low-cardinality.md` - Partition count limits
9. `rules/schema-partition-lifecycle.md` - Partitioning purpose

**Check for:**
- [ ] PRIMARY KEY / ORDER BY column order (low-to-high cardinality)
- [ ] Data types match actual data ranges
- [ ] LowCardinality applied to appropriate string columns
- [ ] Partition key cardinality bounded (100-1,000 values)
- [ ] ReplacingMergeTree has version column if used
- [ ] ReplacingMergeTree partition key never changes for a row (see `query-replacingmergetree-dedup-scope`)

### For Query Reviews (SELECT, JOIN, aggregations)

**Read these rule files:**

1. `rules/query-join-choose-algorithm.md` - Algorithm selection
2. `rules/query-join-filter-before.md` - Pre-join filtering
3. `rules/query-join-use-any.md` - ANY vs regular JOIN
4. `rules/query-index-skipping-indices.md` - Secondary index usage
5. `rules/schema-pk-filter-on-orderby.md` - Filter alignment with ORDER BY

**Check for:**
- [ ] Filters use ORDER BY prefix columns
- [ ] JOINs filter tables before joining (not after)
- [ ] Correct JOIN algorithm for table sizes
- [ ] Skipping indices for non-ORDER BY filter columns
- [ ] Index and projection use confirmed with `EXPLAIN indexes = 1` (see `query-index-verify-usage`)
- [ ] GROUP BY materialized views target SummingMergeTree/AggregatingMergeTree, and queries re-aggregate (see `query-mv-target-engine`)
- [ ] Materialized view output columns are aliased to the target column names (see `query-mv-column-names`)

### For Insert Strategy Reviews (data ingestion, updates, deletes)

**Read these rule files:**

1. `rules/insert-batch-size.md` - Batch sizing requirements
2. `rules/insert-mutation-avoid-update.md` - UPDATE alternatives
3. `rules/insert-mutation-avoid-delete.md` - DELETE alternatives
4. `rules/insert-async-small-batches.md` - Async insert usage
5. `rules/insert-optimize-avoid-final.md` - OPTIMIZE TABLE risks

**Check for:**
- [ ] Batch size 10K-100K rows per INSERT
- [ ] No ALTER TABLE UPDATE for frequent changes
- [ ] ReplacingMergeTree or CollapsingMergeTree for update patterns
- [ ] Async inserts enabled for high-frequency small batches
- [ ] Retries resend identical batches (see `insert-dedup-retries`)
- [ ] With `wait_for_async_insert=0`, flush failures are monitored in `system.asynchronous_insert_log` (see `insert-async-verify-flushes`)

### For Diagnosing a Live Service (errors, slow inserts, stuck operations)

Start with how to read the evidence, then open the rule for the symptom:

1. `rules/agent-system-tables-read-safely.md` - Bounded, per-replica reads of system log tables
2. `rules/agent-system-errors-vs-error-log.md` - Counting errors over a time window

| Symptom | Rule |
|---------|------|
| `TOO_MANY_PARTS`, "Delaying inserting block" | `rules/insert-too-many-parts-diagnose.md` |
| Rows missing or duplicated after retries | `rules/insert-dedup-retries.md` |
| Async inserts accepted but data missing | `rules/insert-async-verify-flushes.md` |
| Mutation not finishing, `TOO_MANY_MUTATIONS` | `rules/insert-mutation-diagnose-stuck.md` |
| Queries slower after lightweight `DELETE` | `rules/insert-mutation-lightweight-delete-cost.md` |
| `MEMORY_LIMIT_EXCEEDED` (241) | `rules/query-memory-diagnose-oom.md` |
| Same query sometimes slow | `rules/query-perf-compare-executions.md` |
| Index or projection not helping | `rules/query-index-verify-usage.md` |
| Inserts slowed or failing because of materialized views | `rules/query-mv-insert-cost.md` |
| Aggregated view totals wrong | `rules/query-mv-target-engine.md`, `rules/query-mv-chained-and-joins.md`, `rules/query-mv-column-names.md` |
| ReplacingMergeTree still returns duplicates | `rules/query-replacingmergetree-dedup-scope.md` |
| ClickPipes Postgres CDC table counts look wrong | `rules/query-cdc-clickpipes-postgres.md` |
| TTL not removing data | `rules/schema-ttl-verify.md` |
| Table larger than expected | `rules/schema-compression-measure.md` |

Diagnosis does not authorize changes. Ask the user before running `KILL`, `SYSTEM`, `OPTIMIZE`, or any `ALTER` a rule suggests.

---

## Output Format

Structure your response as follows:

```
## Rules Checked
- `rule-name-1` - Compliant / Violation found
- `rule-name-2` - Compliant / Violation found
...

## Findings

### Violations
- **`rule-name`**: Description of the issue
  - Current: [what the code does]
  - Required: [what it should do]
  - Fix: [specific correction]

### Compliant
- `rule-name`: Brief note on why it's correct

## Recommendations
[Prioritized list of changes, citing rules]
```

---

## Rule Categories by Priority

| Priority | Category | Impact | Prefix | Rule Count |
|----------|----------|--------|--------|------------|
| 1 | Primary Key Selection | CRITICAL | `schema-pk-` | 4 |
| 2 | Data Type Selection | CRITICAL | `schema-types-` | 5 |
| 3 | JOIN Optimization | CRITICAL | `query-join-` | 5 |
| 4 | Insert Batching | CRITICAL | `insert-batch-` | 1 |
| 5 | Mutations | CRITICAL | `insert-mutation-` | 4 |
| 6 | Partitioning Strategy | HIGH | `schema-partition-` | 4 |
| 7 | Skipping Indices | HIGH | `query-index-` | 2 |
| 8 | Materialized Views | HIGH | `query-mv-` | 6 |
| 9 | Async Inserts | HIGH | `insert-async-` | 3 |
| 10 | OPTIMIZE Avoidance | HIGH | `insert-optimize-` | 1 |
| 11 | JSON Usage | MEDIUM | `schema-json-` | 1 |
| 12 | Agent Schema Discovery | CRITICAL | `agent-discovery-` | 1 |
| 13 | Agent Query Safety | CRITICAL | `agent-query-` | 1 |
| 14 | Agent Connectivity + Formats | HIGH | `agent-connect-` | 1 |
| 15 | Agent System Table Reading | HIGH | `agent-system-` | 2 |
| 16 | Insert Deduplication | HIGH | `insert-dedup-` | 1 |
| 17 | Too Many Parts Diagnosis | HIGH | `insert-too-many-parts-` | 1 |
| 18 | ReplacingMergeTree Dedup Scope | HIGH | `query-replacingmergetree-` | 1 |
| 19 | ClickPipes CDC Tables | HIGH | `query-cdc-` | 1 |
| 20 | Memory Diagnosis | HIGH | `query-memory-` | 1 |
| 21 | Query Performance Diagnosis | MEDIUM | `query-perf-` | 1 |
| 22 | TTL Verification | MEDIUM-HIGH | `schema-ttl-` | 1 |
| 23 | Compression Measurement | MEDIUM | `schema-compression-` | 1 |

---

## Quick Reference

### Schema Design - Primary Key (CRITICAL)

- `schema-pk-plan-before-creation` - Plan ORDER BY before table creation (immutable)
- `schema-pk-cardinality-order` - Order columns low-to-high cardinality
- `schema-pk-prioritize-filters` - Include frequently filtered columns
- `schema-pk-filter-on-orderby` - Query filters must use ORDER BY prefix

### Schema Design - Data Types (CRITICAL)

- `schema-types-native-types` - Use native types, not String for everything
- `schema-types-minimize-bitwidth` - Use smallest numeric type that fits
- `schema-types-lowcardinality` - LowCardinality for <10K unique strings
- `schema-types-enum` - Enum for finite value sets with validation
- `schema-types-avoid-nullable` - Avoid Nullable; use DEFAULT instead

### Schema Design - Partitioning (HIGH)

- `schema-partition-low-cardinality` - Keep partition count 100-1,000
- `schema-partition-lifecycle` - Use partitioning for data lifecycle, not queries
- `schema-partition-query-tradeoffs` - Understand partition pruning trade-offs
- `schema-partition-start-without` - Consider starting without partitioning

### Schema Design - JSON (MEDIUM)

- `schema-json-when-to-use` - JSON for dynamic schemas; typed columns for known

### Schema Design - Storage Lifecycle (MEDIUM)

- `schema-ttl-verify` - Why TTL isn't removing data
- `schema-compression-measure` - Measure compression before tuning codecs

### Query Optimization - JOINs (CRITICAL)

- `query-join-choose-algorithm` - Select algorithm based on table sizes
- `query-join-use-any` - ANY JOIN when only one match needed
- `query-join-filter-before` - Filter tables before joining
- `query-join-consider-alternatives` - Dictionaries/denormalization vs JOIN
- `query-join-null-handling` - join_use_nulls=0 for default values

### Query Optimization - Indices (HIGH)

- `query-index-skipping-indices` - Skipping indices for non-ORDER BY filters
- `query-index-verify-usage` - Confirm primary key, skip index and projection use

### Query Optimization - Materialized Views (HIGH)

- `query-mv-incremental` - Incremental MVs for real-time aggregations
- `query-mv-refreshable` - Refreshable MVs for complex joins
- `query-mv-target-engine` - Aggregating target engines for GROUP BY views
- `query-mv-chained-and-joins` - Chained views and JOINs see the inserted block
- `query-mv-column-names` - View output columns match the target by name
- `query-mv-insert-cost` - Views run inside the INSERT; diagnose with query_views_log

### Query Optimization - Deduplicated and CDC Tables (HIGH)

- `query-replacingmergetree-dedup-scope` - Dedup happens only at merge time, within a partition
- `query-cdc-clickpipes-postgres` - Querying ClickPipes Postgres CDC tables

### Query Optimization - Diagnosis (HIGH)

- `query-memory-diagnose-oom` - Find which memory limit was hit and why
- `query-perf-compare-executions` - Compare individual executions, not averages

### Insert Strategy - Batching (CRITICAL)

- `insert-batch-size` - Batch 10K-100K rows per INSERT

### Insert Strategy - Async (HIGH)

- `insert-async-small-batches` - Async inserts for high-frequency small batches
- `insert-format-native` - Native format for best performance
- `insert-async-verify-flushes` - Check flush results when not waiting for async inserts

### Insert Strategy - Deduplication and Parts (HIGH)

- `insert-dedup-retries` - Insert block deduplication and safe retries
- `insert-too-many-parts-diagnose` - Diagnose TOO_MANY_PARTS before raising limits

### Insert Strategy - Mutations (CRITICAL)

- `insert-mutation-avoid-update` - ReplacingMergeTree instead of ALTER UPDATE
- `insert-mutation-avoid-delete` - Lightweight DELETE or DROP PARTITION
- `insert-mutation-diagnose-stuck` - Read system.mutations before killing a mutation
- `insert-mutation-lightweight-delete-cost` - Query cost of lightweight DELETE until merges

### Insert Strategy - Optimization (HIGH)

- `insert-optimize-avoid-final` - Let background merges work

### Agent Integration - Discovery (CRITICAL)

- `agent-discovery-schema` - Always discover schema before querying

### Agent Integration - Safety (CRITICAL)

- `agent-query-safety` - LIMIT, timeouts, progressive exploration

### Agent Integration - Connectivity + Formats (HIGH)

- `agent-connect-mcp` - MCP + CLI setup, credential discovery, output format selection

### Agent Integration - Reading System Tables (HIGH)

- `agent-system-tables-read-safely` - Bounded, per-replica reads of system log tables
- `agent-system-errors-vs-error-log` - Cumulative counters vs per-interval error history

---

## When to Apply

This skill activates when you encounter:

- AI agent connecting to ClickHouse (MCP, CLI, HTTP)
- Agent workflow design for ClickHouse
- Schema discovery or exploration requests

- `CREATE TABLE` statements
- `ALTER TABLE` modifications
- `ORDER BY` or `PRIMARY KEY` discussions
- Data type selection questions
- Slow query troubleshooting
- JOIN optimization requests
- Data ingestion pipeline design
- Update/delete strategy questions
- ReplacingMergeTree or other specialized engine usage
- Partitioning strategy decisions
- Diagnosing a live service: TOO_MANY_PARTS, stuck mutations, memory errors, missing or duplicated rows, TTL not applying
- Reading `system.query_log`, `system.part_log`, `system.errors` and other system tables as evidence

---

## Rule File Structure

Each rule file in `rules/` contains:

- **YAML frontmatter**: title, impact level, tags
- **Brief explanation**: Why this rule matters
- **Incorrect example**: Anti-pattern with explanation
- **Correct example**: Best practice with explanation
- **Additional context**: Trade-offs, when to apply, references

---

## Full Compiled Document

For the complete guide with all rules expanded inline: `AGENTS.md`

Use `AGENTS.md` when you need to check multiple rules quickly without reading individual files.
