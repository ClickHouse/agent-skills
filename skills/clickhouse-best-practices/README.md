# ClickHouse Best Practices

Agent skill providing comprehensive ClickHouse guidance for schema design, query optimization, and data ingestion.

## Installation

```bash
npx skills add ClickHouse/agent-skills
```

## What's Included

**31 atomic rules** organized by prefix:

| Prefix | Count | Coverage |
|--------|-------|----------|
| `schema-pk-*` | 4 | PRIMARY KEY selection, cardinality ordering |
| `schema-types-*` | 5 | Data types, LowCardinality, Nullable |
| `schema-partition-*` | 4 | Partitioning strategy, lifecycle management |
| `schema-json-*` | 1 | JSON type usage |
| `query-join-*` | 5 | JOIN algorithms, filtering, alternatives |
| `query-index-*` | 1 | Data skipping indices |
| `query-mv-*` | 2 | Incremental and refreshable MVs |
| `insert-batch-*` | 1 | Batch sizing (10K-100K rows) |
| `insert-async-*` | 1 | Async inserts |
| `insert-format-*` | 1 | Data formats |
| `insert-mutation-*` | 2 | Mutation avoidance |
| `insert-optimize-*` | 1 | OPTIMIZE FINAL avoidance |
| `agent-connect-*` | 1 | MCP + CLI connectivity, credentials, output formats |
| `agent-discovery-*` | 1 | Task-relevant schema discovery |
| `agent-query-*` | 1 | Query safety limits, progressive exploration |

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

## Maintenance and validation

Edit the individual rules and rebuild `AGENTS.md`; the compiler preserves their Markdown, examples, and caveats. Keep version metadata in `SKILL.md`, `metadata.json`, and the plugin manifests aligned.

For version-dependent rules, name the feature's minimum version or applicable setting/profile, link the authoritative source, and record the date and scope of verification when updating it. Do not interpret a syntax-parser version as a compatibility guarantee for all examples. Review defaults against the deployed server rather than relying on a blanket minimum version.

From `packages/clickhouse-best-practices-build`:

```bash
bun install
bun run validate
bun run test
bun run validate-sql
bun run check-links
bun run build
```

Install ClickHouse first or set `CLICKHOUSE_BINARY` to an existing executable. CI pins the parser to 25.8.24.21; local checks print the version used. SQL validation uses `clickhouse format --quiet --multiquery`, which parses every SQL fence without running queries or connecting to a database. It fails on parser errors or a missing executable. Python/bash examples and SQL runtime semantics require separate checks; some examples intentionally demonstrate runtime errors or alternative schemas.

The optional review checklist lives in `references/review.md`. Keep assumptions and exceptions in both rule titles/summaries and examples. Use conditional examples where both alternatives can be valid. Structural checks cannot establish agent quality; behavioral evaluation is a separate comparison against a no-skill baseline.

Guidance revised against official ClickHouse references on 2026-09-12 for primary-key alteration, JOIN filter pushdown, and LowCardinality thresholds. This is a documentation review, not a benchmark of every recommendation.
