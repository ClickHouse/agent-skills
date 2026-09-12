# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

---

## 1. Schema Design (schema)

**Impact:** CRITICAL

**Description:** Proper schema design is foundational to ClickHouse performance. Changing existing physical ordering generally requires migration; constrained metadata-only sorting-key changes are possible. Includes primary key selection, data types, partitioning strategy, and JSON usage. Column types and ordering can impact query speed by orders of magnitude.

## 2. Query Optimization (query)

**Impact:** CRITICAL

**Description:** Query patterns dramatically affect performance. JOIN algorithms, filtering strategies, skipping indices, and materialized views can reduce query time from minutes to milliseconds. Pre-computed aggregations read thousands of rows instead of billions.

## 3. Insert Strategy (insert)

**Impact:** CRITICAL

**Description:** Synchronous inserts create parts, potentially across multiple partitions. Frequent small synchronous inserts can overwhelm merges. Proper batching (10K-100K rows), async inserts for high-frequency writes, mutation avoidance, and letting background merges work are essential for stable cluster performance.

## 4. Agent Integration (agent)

**Impact:** CRITICAL

**Description:** AI agents working with ClickHouse need deliberate connection setup, schema discovery, and safe query execution. Use supplied metadata or discover what the task is missing; inspect plans and resource budgets for unfamiliar or expensive queries. Covers MCP/CLI/HTTP connectivity and credential handling, task-relevant metadata discovery and plan inspection, and resource controls such as `max_execution_time` and plan estimates; bound previews without changing requested result semantics.
