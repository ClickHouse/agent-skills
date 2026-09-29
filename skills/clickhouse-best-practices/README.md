# ClickHouse Best Practices

Agent skill providing comprehensive ClickHouse guidance for schema design, query optimization, and data ingestion.

## Installation

```bash
npx skills add ClickHouse/clickhouse-agent-skills
```

## What's Included

**49 atomic rules** organized by prefix:

| Prefix | Count | Coverage |
|--------|-------|----------|
| `schema-pk-*` | 4 | PRIMARY KEY selection, cardinality ordering |
| `schema-types-*` | 5 | Data types, LowCardinality, Nullable |
| `schema-partition-*` | 4 | Partitioning strategy, lifecycle management |
| `schema-json-*` | 1 | JSON type usage |
| `schema-ttl-*` | 1 | Verifying TTL |
| `schema-compression-*` | 1 | Measuring compression |
| `query-join-*` | 5 | JOIN algorithms, filtering, alternatives |
| `query-index-*` | 2 | Data skipping indices, verifying index and projection use |
| `query-mv-*` | 6 | Incremental and refreshable MVs, target engines, chaining, column matching, insert cost |
| `query-replacingmergetree-*` | 1 | Deduplication scope (merge time, per partition) |
| `query-cdc-*` | 1 | Querying ClickPipes Postgres CDC tables |
| `query-memory-*` | 1 | Diagnosing MEMORY_LIMIT_EXCEEDED |
| `query-perf-*` | 1 | Comparing individual query executions |
| `insert-batch-*` | 1 | Batch sizing (10K-100K rows) |
| `insert-async-*` | 3 | Async inserts, data formats, verifying flushes |
| `insert-dedup-*` | 1 | Insert block deduplication and retries |
| `insert-too-many-parts-*` | 1 | Diagnosing TOO_MANY_PARTS |
| `insert-mutation-*` | 4 | Mutation avoidance, stuck mutations, lightweight DELETE cost |
| `insert-optimize-*` | 1 | OPTIMIZE FINAL avoidance |
| `agent-connect-*` | 1 | MCP + CLI connectivity, credentials, output formats |
| `agent-discovery-*` | 1 | 7-step schema discovery workflow |
| `agent-query-*` | 1 | Query safety limits, progressive exploration |
| `agent-system-*` | 2 | Reading system log tables and error history as evidence |

## Trigger Phrases

This skill activates when you:
- "Create a table for..."
- "Optimize this query..."
- "Design a schema for..."
- "Why is this query slow?"
- "How should I insert data into..."
- "Should I use UPDATE or..."
- "Connect Claude to ClickHouse..."
- "Set up MCP for ClickHouse..."
- "Why am I getting TOO_MANY_PARTS?"
- "Why is this mutation stuck?"
- "Why does my materialized view show wrong totals?"
- "Query ClickHouse from an agent..."

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Quick reference and decision frameworks |
| `AGENTS.md` | Complete rule reference (auto-generated) |
| `rules/*.md` | Individual rule definitions |

## Related Documentation

All rules link to official ClickHouse documentation:
- [ClickHouse Best Practices](https://clickhouse.com/docs/best-practices)
