---
name: clickhouse-best-practices
description: ClickHouse database best practices covering schema design, query optimization, and data ingestion. Use when creating tables, writing queries, designing data pipelines, or troubleshooting ClickHouse performance issues.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.2.0"
---

# ClickHouse Best Practices

Comprehensive guidance for ClickHouse covering schema design, query optimization, and data ingestion. Contains 28 rules across 3 main categories (schema, query, insert), prioritized by impact.

> **Official docs:** [ClickHouse Best Practices](https://clickhouse.com/docs/best-practices)

## When to Apply

Reference these guidelines when:
- Creating new tables with `CREATE TABLE`
- Choosing ORDER BY / PRIMARY KEY columns
- Selecting data types for columns
- Queries running slower than expected
- Writing or optimizing JOINs
- Designing data ingestion pipelines
- Handling updates or deletes

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Primary Key Selection | CRITICAL | `schema-pk-` |
| 2 | Data Type Selection | CRITICAL | `schema-types-` |
| 3 | JOIN Optimization | CRITICAL | `query-join-` |
| 4 | Insert Batching | CRITICAL | `insert-batch-` |
| 5 | Mutation Avoidance | CRITICAL | `insert-mutation-` |
| 6 | Partitioning Strategy | HIGH | `schema-partition-` |
| 7 | Skipping Indices | HIGH | `query-index-` |
| 8 | Materialized Views | HIGH | `query-mv-` |
| 9 | Async Inserts | HIGH | `insert-async-` |
| 10 | OPTIMIZE Avoidance | HIGH | `insert-optimize-` |
| 11 | JSON Usage | MEDIUM | `schema-json-` |

## Quick Reference

### 1. Schema Design - Primary Key (CRITICAL)

- `schema-pk-plan-before-creation` - Plan ORDER BY before table creation (immutable)
- `schema-pk-cardinality-order` - Order columns low-to-high cardinality
- `schema-pk-prioritize-filters` - Include frequently filtered columns
- `schema-pk-filter-on-orderby` - Query filters must use ORDER BY prefix

### 2. Schema Design - Data Types (CRITICAL)

- `schema-types-native-types` - Use native types, not String for everything
- `schema-types-minimize-bitwidth` - Use smallest numeric type that fits
- `schema-types-lowcardinality` - LowCardinality for <10K unique strings
- `schema-types-enum` - Enum for finite value sets with validation
- `schema-types-avoid-nullable` - Avoid Nullable; use DEFAULT instead

### 3. Schema Design - Partitioning (HIGH)

- `schema-partition-low-cardinality` - Keep partition count 100-1,000
- `schema-partition-lifecycle` - Use partitioning for data lifecycle, not queries
- `schema-partition-query-tradeoffs` - Understand partition pruning trade-offs
- `schema-partition-start-without` - Consider starting without partitioning

### 4. Schema Design - JSON (MEDIUM)

- `schema-json-when-to-use` - JSON for dynamic schemas; typed columns for known

### 5. Query Optimization - JOINs (CRITICAL)

- `query-join-choose-algorithm` - Select algorithm based on table sizes
- `query-join-use-any` - ANY JOIN when only one match needed
- `query-join-filter-before` - Filter tables before joining
- `query-join-consider-alternatives` - Dictionaries/denormalization vs JOIN
- `query-join-null-handling` - join_use_nulls=0 for default values

### 6. Query Optimization - Indices (HIGH)

- `query-index-skipping-indices` - Skipping indices for non-ORDER BY filters

### 7. Query Optimization - Materialized Views (HIGH)

- `query-mv-incremental` - Incremental MVs for real-time aggregations
- `query-mv-refreshable` - Refreshable MVs for complex joins

### 8. Insert Strategy - Batching (CRITICAL)

- `insert-batch-size` - Batch 10K-100K rows per INSERT

### 9. Insert Strategy - Async (HIGH)

- `insert-async-small-batches` - Async inserts for high-frequency small batches
- `insert-format-native` - Native format for best performance

### 10. Insert Strategy - Mutations (CRITICAL)

- `insert-mutation-avoid-update` - ReplacingMergeTree instead of ALTER UPDATE
- `insert-mutation-avoid-delete` - Lightweight DELETE or DROP PARTITION

### 11. Insert Strategy - Optimization (HIGH)

- `insert-optimize-avoid-final` - Let background merges work

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/schema-pk-cardinality-order.md
rules/query-join-filter-before.md
rules/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example
- Correct code example
- Additional context and references

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
