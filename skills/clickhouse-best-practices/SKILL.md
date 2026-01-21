---
name: clickhouse-best-practices
description: ClickHouse database optimization and best practices guide. This skill should be used when designing schemas, writing queries, configuring tables, or optimizing ClickHouse databases. Triggers on tasks involving ClickHouse schema design, query optimization, table engines, indexing, materialized views, or performance improvements.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.1.0"
---

# ClickHouse Best Practices

Comprehensive optimization guide for ClickHouse databases. Contains rules across 8 categories, prioritized by impact to guide database design, query optimization, and operational practices.

## When to Apply

Reference these guidelines when:
- Designing database schemas and table structures
- Writing queries or optimizing query performance
- Choosing table engines and configuring tables
- Implementing indexes or materialized views
- Setting up distributed clusters
- Monitoring and maintaining ClickHouse instances

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Schema Design | CRITICAL | `schema-` |
| 2 | Query Optimization | CRITICAL | `query-` |
| 3 | Table Engines | HIGH | `table-` |
| 4 | Indexing Strategies | HIGH | `index-` |
| 5 | Materialized Views | MEDIUM-HIGH | `materialized-` |
| 6 | Distributed Operations | MEDIUM | `cluster-` |
| 7 | Operations & Monitoring | MEDIUM | `ops-` |
| 8 | Performance Tuning | LOW-MEDIUM | `performance-` |

## Quick Reference

### 1. Schema Design (CRITICAL)

Proper schema design is foundational to ClickHouse performance. Column types, ordering, and nullable choices can impact query speed by orders of magnitude.

### 2. Query Optimization (CRITICAL)

Query patterns dramatically affect performance. PREWHERE, join order, and aggregation strategies can reduce query time from minutes to milliseconds.

Example rules:
- `query-use-prewhere` - Use PREWHERE for early filtering before reading columns

### 3. Table Engines (HIGH)

Choosing the right table engine family determines data guarantees, deduplication behavior, and query performance characteristics.

### 4. Indexing Strategies (HIGH)

Primary keys and secondary indexes (skip indexes, bloom filters) enable efficient data pruning and can reduce scanned data by 100×.

### 5. Materialized Views (MEDIUM-HIGH)

Materialized views enable real-time aggregations and pre-computed queries, trading storage for query speed.

### 6. Distributed Operations (MEDIUM)

Sharding and replication patterns affect data distribution, query parallelism, and fault tolerance.

### 7. Operations & Monitoring (MEDIUM)

Operational practices for monitoring, backups, mutations, and system table queries ensure database health.

### 8. Performance Tuning (LOW-MEDIUM)

Settings, compression codecs, memory limits, and buffer tuning for specific workloads.

## How to Use

Read individual rule files for detailed explanations and SQL examples:

```
rules/query-use-prewhere.md
rules/_sections.md
rules/_template.md
```

Each rule file contains:
- Brief explanation of why it matters for ClickHouse
- Incorrect SQL example with explanation
- Correct SQL example with explanation
- Additional context and references

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
