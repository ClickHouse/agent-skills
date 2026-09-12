---
name: clickhouse-best-practices
description: ClickHouse schema, query-performance, ingestion, and bounded database exploration guidance. Use when designing or reviewing tables, optimizing queries, choosing insert/update strategies, or querying an unfamiliar ClickHouse database.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.5.0"
---

# ClickHouse Best Practices

Use the references relevant to the task. They capture ClickHouse-specific mechanics and trade-offs; their impact labels are priorities for investigation, not guaranteed speedups or universal requirements.

## How to use

- Preserve the user's requested scope and result semantics. A review requests findings; it does not authorize changing a live database.
- Read only the relevant rules below. Reuse supplied schema and session evidence; connect or discover missing metadata only when the task needs live access.
- Choose optimizations from the workload, data distribution, engine, and deployed version. Verify version-dependent features and defaults against current [official documentation](https://clickhouse.com/docs) or the target instance; a rule is not evidence that a feature is available there.
- Support recommendations with a relevant rule link, official source, or measured query plan/result. Distinguish measured improvements from hypotheses and state material uncertainty.
- Match the response to the request. For a comprehensive review, use the optional [review checklist](references/review.md); ordinary questions do not need a compliance report.

## References by task

### Schema design

- [Use JSON Type for Dynamic Schemas](rules/schema-json-when-to-use.md)
- [Use Partitioning for Data Lifecycle Management](rules/schema-partition-lifecycle.md)
- [Keep Partition Cardinality Bounded](rules/schema-partition-low-cardinality.md)
- [Understand Partition Query Performance Trade-offs](rules/schema-partition-query-tradeoffs.md)
- [Consider Starting Without Partitioning](rules/schema-partition-start-without.md)
- [Order Columns by Cardinality (Low to High)](rules/schema-pk-cardinality-order.md)
- [Filter on ORDER BY Columns in Queries](rules/schema-pk-filter-on-orderby.md)
- [Plan PRIMARY KEY Before Table Creation](rules/schema-pk-plan-before-creation.md)
- [Prioritize Filter Columns in ORDER BY](rules/schema-pk-prioritize-filters.md)
- [Avoid Nullable Unless Semantically Required](rules/schema-types-avoid-nullable.md)
- [Use Enum for Finite Value Sets](rules/schema-types-enum.md)
- [Use LowCardinality for Repeated Strings](rules/schema-types-lowcardinality.md)
- [Minimize Bit-Width for Numeric Types](rules/schema-types-minimize-bitwidth.md)
- [Use Native Types Instead of String](rules/schema-types-native-types.md)

### Query optimization

- [Use Data Skipping Indices for Non-ORDER BY Filters](rules/query-index-skipping-indices.md)
- [Choose the Right JOIN Algorithm](rules/query-join-choose-algorithm.md)
- [Consider Alternatives to JOINs](rules/query-join-consider-alternatives.md)
- [Filter Tables Before Joining](rules/query-join-filter-before.md)
- [Optimize NULL Handling in Outer JOINs](rules/query-join-null-handling.md)
- [Use ANY JOIN When Only One Match Needed](rules/query-join-use-any.md)
- [Use Incremental MVs for Real-Time Aggregations](rules/query-mv-incremental.md)
- [Use Refreshable MVs for Complex Joins and Batch Workflows](rules/query-mv-refreshable.md)

### Ingestion and updates

- [Use Async Inserts for High-Frequency Small Batches](rules/insert-async-small-batches.md)
- [Batch Inserts Appropriately (10K-100K rows)](rules/insert-batch-size.md)
- [Use Native Format for Best Insert Performance](rules/insert-format-native.md)
- [Avoid ALTER TABLE DELETE](rules/insert-mutation-avoid-delete.md)
- [Avoid ALTER TABLE UPDATE](rules/insert-mutation-avoid-update.md)
- [Avoid OPTIMIZE TABLE FINAL](rules/insert-optimize-avoid-final.md)

### Live database access

- [Connect AI Agents to ClickHouse](rules/agent-connect-mcp.md)
- [Discover Relevant Schema Before Querying](rules/agent-discovery-schema.md)
- [Bound Live Query Resource Use](rules/agent-query-safety.md)

## Full reference

[AGENTS.md](AGENTS.md) is the generated compilation for a full read or offline reference. Individual rules are the source of truth; loading the compilation is optional.
