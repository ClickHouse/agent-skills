# ClickHouse Agentic Readiness Assessment

Agent skill that assesses whether a ClickHouse deployment is ready for autonomous AI agent analytics.

## Installation

```bash
npx skills add ClickHouse/clickhouse-agent-skills
```

## What's Included

**20 atomic rules** organized by prefix:

| Prefix | Count | Coverage |
|--------|-------|----------|
| `discover-*` | 4 | Table/column comments, database organization, naming |
| `semantic-*` | 4 | Name-type alignment, enums, LowCardinality, relationships |
| `safety-*` | 3 | Read-only roles, quotas, execution limits |
| `perf-*` | 4 | ORDER BY design, partitions, MVs, skipping indices |
| `pipeline-*` | 3 | Insert activity, part health, TTL policies |
| `access-*` | 2 | Dedicated agent user, settings profiles |

## Trigger Phrases

This skill activates when you:
- "Assess agentic readiness"
- "Is this ClickHouse ready for an AI agent?"
- "Evaluate schema discoverability"
- "Agent-friendly deployment check"
- "Can an agent query this deployment safely?"
- "How discoverable is my schema?"

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Skill definition with procedures and scoring |
| `AGENTS.md` | Complete rule reference (auto-generated) |
| `rules/*.md` | Individual rule definitions |

## Requirements

- Access to the target ClickHouse deployment (via clickhouse-client, HTTP API, or MCP server)
- SELECT privilege on `system.*` tables for the assessing user
- No data modifications are made — assessment is read-only

## Related

- [clickhouse-best-practices](../clickhouse-best-practices/) — Complementary skill for reviewing schemas, queries, and insert strategies
- [ClickHouse System Tables](https://clickhouse.com/docs/operations/system-tables) — Reference for all system tables used in diagnostics
