# Agent Skills for ClickHouse

A collection of ClickHouse best practices and optimization guidelines for AI coding agents.
They follow the specification described in [agentskills.io](https://agentskills.io/home).

## Installation

```bash
npx add-skill clickhouse/agent-skills
```

## Available Skills

### ClickHouse Best Practices

Comprehensive optimization guide for ClickHouse databases covering:
- Schema design patterns
- Query optimization techniques
- Table engine selection
- Indexing strategies
- Materialized views
- Distributed operations
- Operational best practices

**Location:** `skills/clickhouse-best-practices/`

**For humans:** Read [SKILL.md](skills/clickhouse-best-practices/SKILL.md) for an overview, or [AGENTS.md](skills/clickhouse-best-practices/AGENTS.md) for the complete compiled guide.

**For agents:** Reference the skill when designing schemas, writing queries, or optimizing ClickHouse databases.

```bash
cd packages/clickhouse-best-practices-build

# Install dependencies
bun install

# Validate rule structure
bun run validate

# Validate SQL syntax
bun run validate-sql

# Check internal links
bun run check-links

# Build AGENTS.md
bun run build
```

## License

Apache 2.0
