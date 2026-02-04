# CLAUDE.md

This file provides guidance to AI coding agents working with this repository.

## Repository Purpose

This is an **Agent Skills** repository providing **MooseStack + ClickHouse best practices**. It extends AI coding agents (Claude Code, Cursor, Copilot, etc.) with domain-specific expertise for building data applications with MooseStack.

> Forked from [ClickHouse/agent-skills](https://github.com/ClickHouse/agent-skills) with MooseStack TypeScript and Python examples added to every rule.

Skills follow the open specification at [agentskills.io](https://agentskills.io).

## Repository Structure

```
agent-skills/
├── skills/
│   └── clickhouse-best-practices/    # The skill
│       ├── SKILL.md                  # Quick reference for agents (manually maintained)
│       ├── AGENTS.md                 # Complete compiled guide (GENERATED - do not edit)
│       ├── metadata.json             # Version, organization, abstract
│       ├── README.md                 # User documentation
│       └── rules/                    # Individual rule files (source of truth)
│           ├── _template.md          # Template for new rules
│           ├── _sections.md          # Section definitions
│           └── *.md                  # Rule files
├── packages/
│   └── clickhouse-best-practices-build/   # Build tooling (Bun/TypeScript)
│       └── src/
│           ├── build.ts              # Generates AGENTS.md
│           ├── validate.ts           # Rule structure validation
│           ├── validate-sql.ts       # SQL syntax validation
│           └── check-links.ts        # Internal link validation
├── AGENTS.md                         # Top-level agent guidance
└── README.md                         # Installation instructions
```

## Key Commands

From `packages/clickhouse-best-practices-build/`:

```bash
bun install                    # Install dependencies
bun run validate               # Validate rule structure
bun run validate-sql           # Validate SQL syntax in examples
bun run check-links            # Check internal markdown links
bun run build                  # Generate AGENTS.md from rules
bun run build --upgrade-version  # Build + increment version
```

## Adding a New Rule

1. **Create file** in `skills/clickhouse-best-practices/rules/` named `{category}-{subcategory}-{description}.md`

2. **Use this structure**:
```markdown
---
title: Clear Imperative Title
impact: CRITICAL | HIGH | MEDIUM-HIGH | MEDIUM | LOW-MEDIUM | LOW
impactDescription: "Quantified improvement (e.g., 10x faster queries)"
tags: [tag1, tag2]
---

## Clear Imperative Title

**Impact: LEVEL**

Brief explanation of WHY this rule matters (1-3 paragraphs).

**Incorrect (what's wrong):**

```sql
-- Bad: reason
SELECT * FROM table;
```

**Correct (what's right):**

```sql
-- Good: reason
SELECT * FROM table;
```

**MooseStack - [Context-specific heading]:**

```typescript
import { Key, OlapTable } from "@514labs/moose-lib";

interface Example {
  id: Key<string>;
  // ... relevant fields with proper types
}

export const exampleTable = new OlapTable<Example>("example", {
  orderByFields: ["field1", "field2"]
});
```

```python
from moose_lib import Key, OlapTable
from pydantic import BaseModel

class Example(BaseModel):
    id: Key[str]
    # ... relevant fields with proper types

example_table = OlapTable[Example]("example", {
    "order_by_fields": ["field1", "field2"]
})
```

Reference: [ClickHouse Docs](https://clickhouse.com/docs/...)
```

3. **Run validation and build**:
```bash
cd packages/clickhouse-best-practices-build
bun run validate && bun run validate-sql && bun run build
```

4. **Commit both** the rule file AND the regenerated `AGENTS.md`

## Rule Naming Convention

Rules are named `{category}-{subcategory}-{description}.md`:

| Category | Prefix | Examples |
|----------|--------|----------|
| Schema - Primary Key | `schema-pk-` | `schema-pk-cardinality-order.md` |
| Schema - Types | `schema-types-` | `schema-types-avoid-nullable.md` |
| Schema - Partitioning | `schema-partition-` | `schema-partition-lifecycle.md` |
| Schema - JSON | `schema-json-` | `schema-json-when-to-use.md` |
| Query - JOINs | `query-join-` | `query-join-filter-before.md` |
| Query - Indexes | `query-index-` | `query-index-skipping-indices.md` |
| Query - MVs | `query-mv-` | `query-mv-incremental.md` |
| Insert - Batching | `insert-batch-` | `insert-batch-size.md` |
| Insert - Async | `insert-async-` | `insert-async-small-batches.md` |
| Insert - Mutations | `insert-mutation-` | `insert-mutation-avoid-update.md` |
| Insert - Optimize | `insert-optimize-` | `insert-optimize-avoid-final.md` |

## Validation Requirements

Every rule MUST have:
- Non-empty title (from `## ` heading or frontmatter)
- Non-empty explanation paragraph
- At least one **Incorrect** example (labels: "Incorrect", "Wrong", "Bad")
- At least one **Correct** example (labels: "Correct", "Good", "Usage", "Example")
- Code block in examples
- Valid impact level (one of 6 levels)
- **MooseStack section** with TypeScript and Python examples

## MooseStack Key Patterns

When adding or updating MooseStack examples, use these patterns:

**TypeScript Type Annotations:**
- `Key<string>` - Primary key field
- `UInt8`, `UInt16`, `UInt32`, `UInt64` - Unsigned integers
- `Int8`, `Int16`, `Int32`, `Int64` - Signed integers
- `string & LowCardinality` - Low cardinality strings
- `string & ClickHouseDefault<"''">` - String with DEFAULT value
- `enum Status { ... }` - Enum types

**Python Type Annotations:**
- `Key[str]` - Primary key field
- `Annotated[int, "uint64"]` - Unsigned integers
- `Annotated[str, "LowCardinality"]` - Low cardinality strings
- `Annotated[str, clickhouse_default("''")] = ""` - String with DEFAULT
- `class Status(str, Enum)` - Enum types

**OlapTable Configuration:**
```typescript
new OlapTable<T>("name", {
  orderByFields: ["col1", "col2"],      // ORDER BY
  partitionByField: "toStartOfMonth(timestamp)",  // PARTITION BY
  engine: "ReplacingMergeTree(updatedAt)",  // Table engine
  ttl: "timestamp + INTERVAL 1 YEAR DELETE",  // TTL
  indexes: [{ name: "idx", column: "col", type: "bloom_filter", granularity: 4 }]
})
```

## Impact Levels

| Level | Meaning |
|-------|---------|
| CRITICAL | 10x+ improvement or prevents serious issues |
| HIGH | 2-10x improvement, significant scalability impact |
| MEDIUM-HIGH | 25-100% improvement |
| MEDIUM | 10-25% improvement |
| LOW-MEDIUM | 5-10% improvement |
| LOW | Minor improvements or edge cases |

## Files You Should NOT Edit Directly

- `skills/clickhouse-best-practices/AGENTS.md` - Generated by build system
- `bun.lock` - Managed by bun

## Files That Require Regeneration After Edit

After editing any rule in `rules/`, you must run `bun run build` to regenerate `AGENTS.md`.

## Section System

Sections are inferred from filename prefix:
- `schema-*` → Section 1 (Schema Design)
- `query-*` → Section 2 (Query Optimization)
- `insert-*` → Section 3 (Insert Strategy)

Section metadata is defined in `rules/_sections.md`.

## SQL Validation Notes

- The `validate-sql` script downloads a ClickHouse binary to validate SQL syntax
- Only runs on macOS and Linux
- Blocks dangerous functions: `file()`, `url()`, `remote()`, etc.
- SQL in code blocks must be syntactically valid ClickHouse SQL

## CI/CD

GitHub Actions runs on changes to `skills/` or `packages/`:
1. `bun run validate` - Structure check
2. `bun run validate-sql` - SQL syntax
3. `bun run check-links` - Link validation
4. `bun run build` - Generate AGENTS.md
5. Upload AGENTS.md as artifact

## Common Tasks

### Modify an existing rule
1. Edit the rule file in `rules/`
2. Run `bun run validate && bun run build`
3. Commit both the rule and `AGENTS.md`

### Add a new section
1. Add section definition to `rules/_sections.md`
2. Create rules with the new prefix
3. Run build

### Update version
```bash
bun run build --upgrade-version
```
This updates `metadata.json` and `SKILL.md` frontmatter.

### Update SKILL.md
Edit manually - this is the quick reference that agents see first. Keep it under 500 lines.
