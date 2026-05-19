# ClickHouse Agent Skills

The official Agent Skills for [ClickHouse](https://clickhouse.com/). These skills help LLMs and agents to adopt best practices when working with ClickHouse and [chdb](https://clickhouse.com/docs/chdb) (in-process ClickHouse for Python).

You can use these skills with open-source ClickHouse and managed ClickHouse Cloud. [Try ClickHouse Cloud with $300 in free credits](https://clickhouse.com/cloud?utm_medium=github&utm_source=github&utm_ref=agent-skills).

## Installation

### npx

```bash
npx skills add clickhouse/agent-skills
```
The CLI auto-detects installed agents and prompts you to select where to install.

### clickhousectl

Use the ClickHouse CLI [`clickhousectl`](https://github.com/ClickHouse/clickhousectl) to install the agent skills:

```bash
clickhousectl skills
```

## What is this?

Agent Skills are packaged instructions that extend AI coding agents (Claude Code, Cursor, Copilot, etc.) with domain-specific expertise. This repository provides skills for ClickHouse databases and chdb — covering schema design, query optimization, data ingestion patterns, and in-process analytics with Python.

When an agent loads these skills, it gains knowledge of ClickHouse best practices and chdb APIs, and can apply them while helping you design tables, write queries, analyze data, or troubleshoot performance issues.

Skills follow the open specification at [agentskills.io](https://agentskills.io).

## Available Skills

### ClickHouse Best Practices

**28 rules** covering schema design, query optimization, and data ingestion—prioritized by impact.

| Category | Rules | Impact |
|----------|-------|--------|
| Primary Key Selection | 4 | CRITICAL |
| Data Type Selection | 5 | CRITICAL |
| JOIN Optimization | 5 | CRITICAL |
| Insert Batching | 1 | CRITICAL |
| Mutation Avoidance | 2 | CRITICAL |
| Partitioning Strategy | 4 | HIGH |
| Skipping Indices | 1 | HIGH |
| Materialized Views | 2 | HIGH |
| Async Inserts | 2 | HIGH |
| OPTIMIZE Avoidance | 1 | HIGH |
| JSON Usage | 1 | MEDIUM |

**Location:** [`skills/clickhouse-best-practices/`](./skills/clickhouse-best-practices/)

**For humans:** Read [SKILL.md](./skills/clickhouse-best-practices/SKILL.md) for an overview, or [AGENTS.md](./skills/clickhouse-best-practices/AGENTS.md) for the complete compiled guide.

**For agents:** The skill activates automatically when you work with ClickHouse—creating tables, writing queries, or designing data pipelines.

### ClickHouse Architecture Advisor

**5 decision frameworks** covering workload-aware architecture decisions for real-time ClickHouse deployments.

| Decision Area | Impact |
|---------------|--------|
| Ingestion Strategy | CRITICAL |
| Join & Enrichment Patterns | CRITICAL |
| Late-Arriving Data & Upserts | CRITICAL |
| Time-Series Partitioning | HIGH |
| Real-Time Pre-Aggregation | HIGH |

Complements `clickhouse-best-practices` by answering *when*, *why*, and *how* — not just *what*. All recommendations are explicitly classified as `official`, `derived`, or `field` guidance.

**Location:** [`skills/clickhouse-architecture-advisor/`](./skills/clickhouse-architecture-advisor/)

**For humans:** Read [SKILL.md](./skills/clickhouse-architecture-advisor/SKILL.md) for an overview, or [AGENTS.md](./skills/clickhouse-architecture-advisor/AGENTS.md) for the compiled guide.

**For agents:** The skill activates during architecture design sessions — when choosing ingestion patterns, designing time-series schemas, selecting enrichment strategies, or handling mutable state.

### ClickHouse JS Node Troubleshooting

**Troubleshooting guide** for the ClickHouse Node.js client (`@clickhouse/client`). Covers common failure modes including socket hang-up / `ECONNRESET`, Keep-Alive misconfiguration, data type mismatches, read-only user restrictions, proxy / pathname URL confusion, TLS certificate errors, compression issues, logging setup, and query parameter interpolation.

**Location:** [`skills/clickhouse-js-node-troubleshooting/`](./skills/clickhouse-js-node-troubleshooting/)

**For agents:** The skill activates when users report errors, unexpected behavior, or configuration questions involving the ClickHouse Node.js client — including vague symptoms like "my inserts keep failing" or "connection drops randomly" in a Node.js context. Not used for browser/Web client issues.

### chdb DataStore

**Pandas-compatible API** for chdb — drop-in pandas replacement backed by ClickHouse. Write `import chdb.datastore as pd` and use the same pandas API, 10-100x faster. Supports 16+ data sources (MySQL, PostgreSQL, S3, MongoDB, Iceberg, Delta Lake, etc.) with cross-source joins.

**Location:** [`skills/chdb-datastore/`](./skills/chdb-datastore/)

**For agents:** The skill activates when you analyze data with pandas-style syntax, speed up slow pandas code, query remote databases as DataFrames, or join data across different sources.

### chdb SQL

**In-process ClickHouse SQL** for Python — run SQL queries on local files, remote databases, and cloud storage without a server. Covers `chdb.query()`, Session, DB-API 2.0, parametrized queries, UDFs, streaming, and all ClickHouse table functions.

**Location:** [`skills/chdb-sql/`](./skills/chdb-sql/)

**For agents:** The skill activates when you write SQL queries against files, use ClickHouse table functions, build stateful analytical pipelines, or use advanced ClickHouse SQL features.

## Quick Start

After installation, your AI agent will reference these skills when:

- Creating new tables with `CREATE TABLE`
- Choosing `ORDER BY` / `PRIMARY KEY` columns
- Selecting data types for columns
- Optimizing slow queries
- Writing or tuning JOINs
- Designing data ingestion pipelines
- Handling updates or deletes
- Analyzing data with pandas-style DataStore API
- Querying files or databases with chdb SQL
- Joining data across different sources (MySQL + S3 + local files)

Example prompts:
> "Create a table for storing user events with fields for user_id, event_type, properties (JSON), and timestamp"

The agent will apply relevant ClickHouse best practices rules.

> "Load this Parquet file and group by country, show top 10 by revenue"

The agent will use chdb DataStore or SQL to query the file directly.

> "Join my MySQL customers table with this local orders.parquet file"

The agent will use chdb's cross-source join capabilities.

## Supported Agents

Skills are **agent-agnostic**—the same skill works across all supported AI coding assistants:

| Agent | Config Directory |
|-------|------------------|
| [Claude Code](https://claude.ai/code) | `.claude/skills/` |
| [Cursor](https://cursor.sh) | `.cursor/skills/` |
| [Windsurf](https://codeium.com/windsurf) | `.windsurf/skills/` |
| [GitHub Copilot](https://github.com/features/copilot) | `.github/skills/` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `.gemini/skills/` |
| [Cline](https://github.com/cline/cline) | `.cline/skills/` |
| [Codex](https://openai.com/codex) | `.codex/skills/` |
| [Goose](https://github.com/block/goose) | `.goose/skills/` |
| [Roo Code](https://roo.ai) | `.roo/skills/` |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | `.openhands/skills/` |

And 13 more including Amp, Kiro CLI, Trae, Zencoder, and others.

The installer detects which agents you have by checking for their configuration directories. If an agent isn't listed, either install it first or create its config directory manually (e.g., `mkdir -p ~/.cursor`).

## License

Apache 2.0 — see [LICENSE](./LICENSE) for details.
