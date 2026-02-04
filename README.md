# MooseStack ClickHouse Agent Skills

Agent Skills for building data applications with [MooseStack](https://docs.fiveonefour.com/moosestack) and ClickHouse. These skills help LLMs and agents adopt best practices when working with MooseStack data models, OlapTables, IngestPipelines, and ClickHouse queries.

> Forked from [ClickHouse/agent-skills](https://github.com/ClickHouse/agent-skills) with MooseStack TypeScript and Python examples added to every rule.

## Installation

```bash
npx skills add 514-labs/moose-agent-skills
```

The CLI auto-detects installed agents and prompts you to select where to install.

## What is this?

Agent Skills are packaged instructions that extend AI coding agents (Claude Code, Cursor, Copilot, etc.) with domain-specific expertise. This repository provides skills for MooseStack applications—covering data model design, query optimization, and data ingestion patterns with TypeScript and Python examples.

When an agent loads these skills, it gains knowledge of MooseStack and ClickHouse best practices and can apply them while helping you design data models, configure OlapTables, write queries, or troubleshoot performance issues.

Skills follow the open specification at [agentskills.io](https://agentskills.io).

## Available Skills

### MooseStack ClickHouse Best Practices

**28 rules** covering data model design, query optimization, and data ingestion—each with TypeScript and Python examples.

| Category | Rules | Impact |
|----------|-------|--------|
| orderByFields Selection | 4 | CRITICAL |
| Type Annotations | 5 | CRITICAL |
| JOIN Optimization | 5 | CRITICAL |
| IngestPipeline / Batching | 1 | CRITICAL |
| Mutation Avoidance | 2 | CRITICAL |
| Partitioning Strategy | 4 | HIGH |
| Skipping Indices | 1 | HIGH |
| MaterializedViews | 2 | HIGH |
| Async Inserts | 2 | HIGH |
| OPTIMIZE Avoidance | 1 | HIGH |
| JSON Usage | 1 | MEDIUM |

**Location:** [`skills/clickhouse-best-practices/`](./skills/clickhouse-best-practices/)

**For humans:** Read [SKILL.md](./skills/clickhouse-best-practices/SKILL.md) for an overview, or [AGENTS.md](./skills/clickhouse-best-practices/AGENTS.md) for the complete compiled guide.

**For agents:** The skill activates automatically when you work with MooseStack—defining data models, configuring OlapTables, or designing IngestPipelines.

## Quick Start

After installation, your AI agent will reference these best practices when:

- Defining MooseStack data models (TypeScript interfaces / Python Pydantic models)
- Configuring `OlapTable` with `orderByFields`, `partitionByField`, `engine`
- Choosing type annotations (`Key`, `UInt64`, `LowCardinality`, etc.)
- Creating `IngestPipeline` configurations
- Writing `Api` query handlers with ClickHouse SQL
- Defining `MaterializedView` for incremental aggregations
- Handling updates or deletes with specialized table engines

Example prompt:
> "Create a MooseStack data model for storing user events with fields for user_id, event_type, properties (JSON), and timestamp"

The agent will apply relevant rules like proper type annotations, column ordering in `orderByFields`, and partitioning strategy.

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
