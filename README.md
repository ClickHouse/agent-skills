# ClickHouse Agent Skills & Claude Code Plugin

The official Agent Skills and Claude Code Plugin for [ClickHouse](https://clickhouse.com/). These skills help LLMs and agents to adopt best practices when working with ClickHouse.

You can use these skills with open-source ClickHouse and managed ClickHouse Cloud. [Try ClickHouse Cloud with $300 in free credits](https://clickhouse.com/cloud?utm_medium=github&utm_source=github&utm_ref=agent-skills).

## Installation

**For all agents (Claude Code, Cursor, Copilot, etc.):**
```bash
npx skills add clickhouse/agent-skills
```

The CLI auto-detects installed agents and prompts you to select where to install.

**For Claude Code (as a plugin):**
```bash
claude plugin add clickhouse/agent-skills
```

This installs the plugin including ClickHouse best practice skills, recommended rules, and the ClickHouse MCP server.

## What is this?

Agent Skills are packaged instructions that extend AI coding agents (Claude Code, Cursor, Copilot, etc.) with domain-specific expertise. This repository provides skills for ClickHouse databases—covering schema design, query optimization, and data ingestion patterns. Skills follow the open specification at [agentskills.io](https://agentskills.io).

For Claude Code users, this repository also ships as a native **Claude Code Plugin**. The plugin bundles the same skills together with the [ClickHouse MCP server](https://mcp.clickhouse.cloud/mcp), giving Claude Code direct access to ClickHouse tooling on top of the best practice rules.

When an agent loads these skills, it gains knowledge of ClickHouse best practices and can apply them while helping you design tables, write queries, or troubleshoot performance issues.

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

## Claude Code Plugin

For Claude Code users, this repository also serves as a plugin. In addition to the skills above, the plugin includes:

- **MCP Server** — connects Claude Code to the [ClickHouse MCP server](https://mcp.clickhouse.cloud/mcp) for live documentation and query capabilities
- **Rules** — ClickHouse-specific rules automatically applied during your coding sessions

The plugin metadata is defined in [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json) and the MCP configuration in [`mcp.json`](./mcp.json).

## Quick Start

After installation, your AI agent will reference these best practices when:

- Creating new tables with `CREATE TABLE`
- Choosing `ORDER BY` / `PRIMARY KEY` columns
- Selecting data types for columns
- Optimizing slow queries
- Writing or tuning JOINs
- Designing data ingestion pipelines
- Handling updates or deletes

Example prompt:
> "Create a table for storing user events with fields for user_id, event_type, properties (JSON), and timestamp"

The agent will apply relevant rules like proper column ordering in the primary key, appropriate data types, and partitioning strategy.

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
