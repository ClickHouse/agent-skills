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

**31 rules** covering schema design, query optimization, data ingestion and database exploration, prioritized by impact.

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
| Async Inserts | 1 | HIGH |
| Insert Format | 1 | HIGH |
| OPTIMIZE Avoidance | 1 | HIGH |
| JSON Usage | 1 | MEDIUM |
| Agent Database Exploration | 3 | CRITICAL / HIGH |

**Location:** [`skills/clickhouse-best-practices/`](./skills/clickhouse-best-practices/)

**For humans:** Read [SKILL.md](./skills/clickhouse-best-practices/SKILL.md) for an overview, or [AGENTS.md](./skills/clickhouse-best-practices/AGENTS.md) for the complete compiled guide.

**For agents:** Use for ClickHouse schema, query-performance, ingestion and database exploration tasks. Read only the rules relevant to the requested work.

### ClickHouse Architecture Advisor

**5 decision frameworks** covering workload-aware architecture decisions for real-time ClickHouse deployments.

| Decision Area | Impact |
|---------------|--------|
| Ingestion Strategy | CRITICAL |
| Join & Enrichment Patterns | CRITICAL |
| Late-Arriving Data & Upserts | CRITICAL |
| Time-Series Partitioning | HIGH |
| Real-Time Pre-Aggregation | HIGH |

Complements `clickhouse-best-practices` by answering *when*, *why*, and *how* — not just *what*. Recommendations distinguish official documentation, workload-specific inference, and field heuristics; structured reviews can use explicit provenance labels.

**Location:** [`skills/clickhouse-architecture-advisor/`](./skills/clickhouse-architecture-advisor/)

**For humans:** Read [SKILL.md](./skills/clickhouse-architecture-advisor/SKILL.md) for an overview, or [AGENTS.md](./skills/clickhouse-architecture-advisor/AGENTS.md) for reference navigation.

**For agents:** The skill activates during architecture design sessions — when choosing ingestion patterns, designing time-series schemas, selecting enrichment strategies, or handling mutable state.

### ClickHouse JS Node Coding

API guidance for `@clickhouse/client` on Node.js: configuration, typed query parameters, result handling, insertion, compression and request settings. Use the APIs supported by the installed client version.

**Location:** [`skills/clickhouse-js-node-coding/`](./skills/clickhouse-js-node-coding/)

### ClickHouse JS Node RowBinary

Read and write ClickHouse RowBinary formats in Node.js. Includes codec source, wire-format constraints and targeted optimization guidance; format comparisons are available when choosing a format is part of the task.

**Location:** [`skills/clickhouse-js-node-rowbinary/`](./skills/clickhouse-js-node-rowbinary/)

### ClickHouse JS Node Troubleshooting

**Troubleshooting guide** for the ClickHouse Node.js client (`@clickhouse/client`). Covers common failure modes including socket hang-up / `ECONNRESET`, Keep-Alive misconfiguration, data type mismatches, read-only user restrictions, proxy / pathname URL confusion, TLS certificate errors, compression issues, logging setup, and query parameter interpolation.

**Location:** [`skills/clickhouse-js-node-troubleshooting/`](./skills/clickhouse-js-node-troubleshooting/)

**For agents:** The skill activates when users report errors, unexpected behavior, or configuration questions involving the ClickHouse Node.js client — including vague symptoms like "my inserts keep failing" or "connection drops randomly" in a Node.js context. Not used for browser/Web client issues.

### chdb DataStore

**Pandas-compatible API** for chdb — lazy DataFrame operations backed by ClickHouse, with readers for local and remote sources. Evaluate result compatibility and performance on representative workloads before migrating pandas code.

**Location:** [`skills/chdb-datastore/`](./skills/chdb-datastore/)

**For agents:** Use when the project already uses chDB DataStore or the user wants to evaluate it for pandas-style analysis and cross-source queries.

### chdb SQL

**In-process ClickHouse SQL** for Python — run SQL queries on local files, remote databases, and cloud storage without a server. Covers `chdb.query()`, Session, DB-API 2.0, parametrized queries, UDFs, streaming, and common source table functions.

**Location:** [`skills/chdb-sql/`](./skills/chdb-sql/)

**For agents:** Use for an existing chDB project or a requested chDB SQL analysis, including sessions and DB-API integrations.

### ClickHouse Managed Postgres RCA

Investigate ClickHouse-managed Postgres performance using Prometheus metrics and Slow Query Patterns API evidence. Produces recommendations tied to the incident window, with uncertainty stated where evidence is incomplete.

**Location:** [`skills/clickhouse-managed-postgres-rca/`](./skills/clickhouse-managed-postgres-rca/)

### Infra ClickHouse

**Local and cloud workflows** for running ClickHouse with [`clickhousectl`](https://github.com/ClickHouse/clickhousectl). The top-level `SKILL.md` is a decision tree that routes to the right reference: [`ref/local.md`](./skills/infra-clickhouse/ref/local.md) for local development (install ClickHouse, start a server, create schemas, seed data) and [`ref/cloud.md`](./skills/infra-clickhouse/ref/cloud.md) for ClickHouse Cloud (authenticate, create a service, migrate schemas, connect an application). Use the cloud workflow when ClickHouse Cloud is the selected deployment target. Supersedes `clickhousectl-local-dev` and `clickhousectl-cloud-deploy`.

**Location:** [`skills/infra-clickhouse/`](./skills/infra-clickhouse/)

**For agents:** Use for requested local ClickHouse setup or ClickHouse Cloud operations with `clickhousectl`; reuse existing infrastructure when present.

### Infra Postgres

**Local and cloud workflows** for running Postgres with [`clickhousectl`](https://github.com/ClickHouse/clickhousectl). The top-level `SKILL.md` is a decision tree that routes to the right reference: [`ref/local.md`](./skills/infra-postgres/ref/local.md) for local Docker-backed Postgres development (start, psql client, `.env` wiring, lifecycle) and [`ref/cloud.md`](./skills/infra-postgres/ref/cloud.md) for managed ClickHouse Cloud Postgres services (beta) — authentication, service creation, connections and TLS, runtime configuration, read replicas, failover, and point-in-time restore. Use the cloud workflow when ClickHouse Cloud is the selected deployment target.

**Location:** [`skills/infra-postgres/`](./skills/infra-postgres/)

**For agents:** Use for local Docker-backed Postgres or ClickHouse Cloud Postgres operations with `clickhousectl`. Preserve the selected provider and existing credentials.

### ClickStack OTel Collector

**Step-by-step workflow** for wiring an OpenTelemetry collector into a Managed ClickStack service on ClickHouse Cloud. Covers deploying a new local collector (Docker run or Docker Compose) or configuring an existing collector, provisioning an ingest SQL user when needed, optional synthetic telemetry, and evidence-based ingestion/UI verification.

**Location:** [`skills/clickstack-otel-collector/`](./skills/clickstack-otel-collector/)

**For agents:** The skill activates when a user wants to connect an OpenTelemetry collector to a Managed ClickStack service, send telemetry (logs, traces, metrics) into ClickStack, or verify their observability data pipeline end-to-end.

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
- Setting up a local ClickHouse development environment or deploying to ClickHouse Cloud with `clickhousectl`
- Setting up a local Postgres or a managed ClickHouse Cloud Postgres service with `clickhousectl`
- Wiring an OpenTelemetry collector into Managed ClickStack

Example prompts:
> "Create a table for storing user events with fields for user_id, event_type, properties (JSON), and timestamp"

The agent will apply relevant ClickHouse best practices rules.

> "Use chDB to load this Parquet file and group by country, showing top 10 by revenue"

The agent will use chdb DataStore or SQL to query the file directly.

> "Use chDB to join my MySQL customers table with this local orders.parquet file"

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
