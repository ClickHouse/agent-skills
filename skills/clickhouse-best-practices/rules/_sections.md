# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

---

## 1. Schema Design (schema)

**Impact:** CRITICAL

**Description:** Proper schema design is foundational to ClickHouse performance. ORDER BY is immutable after table creation; wrong choices require full data migration. Includes primary key selection, data types, partitioning strategy, and JSON usage. Column types and ordering can impact query speed by orders of magnitude.

## 2. Query Optimization (query)

**Impact:** CRITICAL

**Description:** Query patterns dramatically affect performance. JOIN algorithms, filtering strategies, skipping indices, and materialized views can reduce query time from minutes to milliseconds. Pre-computed aggregations read thousands of rows instead of billions.

## 3. Insert Strategy (insert)

**Impact:** CRITICAL

**Description:** Each INSERT creates a data part. Single-row inserts overwhelm the merge process. Proper batching (10K-100K rows), async inserts for high-frequency writes, mutation avoidance, and letting background merges work are essential for stable cluster performance.

## 4. Agent Integration (agent)

**Impact:** CRITICAL

**Description:** AI agents working with ClickHouse need deliberate connection setup, schema discovery, and safe query execution. Agents that skip discovery write queries that ignore the sort key and scan full tables; agents without safety limits run unbounded queries that exhaust compute budgets. Covers MCP/CLI/HTTP connectivity and credential handling, the schema discovery workflow (databases → tables → columns → sort keys → skip indexes → sample → EXPLAIN), and query safety defaults (LIMIT, `max_execution_time`, `EXPLAIN ESTIMATE`).
