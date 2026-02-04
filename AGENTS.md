# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Cursor, Copilot, etc.) when working with code in this repository.

## Repository Overview

A collection of skills for AI agents working with MooseStack applications and ClickHouse databases. Skills are packaged instructions and guidelines that extend agent capabilities for data model design, query optimization, and operational best practices. Each rule includes TypeScript and Python examples for MooseStack.

> Forked from [ClickHouse/agent-skills](https://github.com/ClickHouse/agent-skills) with MooseStack examples added.

## Repository Structure

```
agent-skills/
├── skills/
│   └── clickhouse-best-practices/   # MooseStack + ClickHouse optimization
│       ├── SKILL.md                 # Skill definition (overview)
│       ├── AGENTS.md                # Full compiled guide (generated)
│       ├── metadata.json            # Version, organization, abstract
│       ├── README.md                # Maintainer guide
│       └── rules/                   # Individual rule files with TS/PY examples
│           ├── _sections.md         # Section metadata
│           ├── _template.md         # Template for new rules
│           └── *.md                 # Rule files (e.g., query-join-filter-before.md)
├── packages/
│   └── clickhouse-best-practices-build/  # Build tooling
│       ├── package.json             # Bun scripts
│       ├── tsconfig.json            # TypeScript config
│       └── src/
│           ├── config.ts            # Path configuration
│           ├── types.ts             # Type definitions
│           ├── parser.ts            # Markdown parser
│           ├── build.ts             # Build script
│           ├── validate.ts          # Rule validator
│           ├── validate-sql.ts      # SQL syntax validator
│           └── check-links.ts       # Internal link checker
└── .github/
    └── workflows/
        └── clickhouse-best-practices-ci.yml  # CI workflow
```

## Creating a New Skill

### Directory Structure

```
skills/
  {skill-name}/           # kebab-case directory name
    SKILL.md              # Required: skill definition
    AGENTS.md             # Generated: full compiled guide
    metadata.json         # Required: version, organization, abstract
    README.md             # Required: maintainer guide
    rules/                # Required: rule files
      _sections.md        # Section metadata
      _template.md        # Template for new rules
      *.md                # Individual rules
```

### Naming Conventions

- **Skill directory**: `kebab-case` (e.g., `clickhouse-best-practices`)
- **SKILL.md**: Always uppercase, always this exact filename
- **Rule files**: `{section-prefix}-{descriptive-name}.md` (e.g., `query-use-prewhere.md`)
- **Section prefixes**: Match the section IDs defined in `_sections.md`

### SKILL.md Format

```markdown
---
name: {skill-name}
description: {One sentence describing when to use this skill. Include trigger phrases.}
license: MIT
metadata:
  author: {organization}
  version: "{version}"
---

# {Skill Title}

{Brief description of what the skill does.}

## When to Apply

Reference these guidelines when:
- {Use case 1}
- {Use case 2}

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | {Category} | {Impact} | `{prefix}-` |

## Quick Reference

{Brief overview of each category and key rules}

## How to Use

{Instructions on reading individual rule files}

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
```

### Rule File Format

Use the template in `rules/_template.md`. Each rule file must have:

1. **YAML frontmatter**:
   ```yaml
   ---
   title: Rule Title
   impact: CRITICAL | HIGH | MEDIUM-HIGH | MEDIUM | LOW-MEDIUM | LOW
   impactDescription: Optional (e.g., "10-100× query speedup")
   tags: skill, category, specific-tags
   ---
   ```

2. **Rule structure**:
   - Brief explanation of why it matters
   - **Incorrect:** SQL code example showing the anti-pattern
   - **Correct:** SQL code example showing the best practice
   - **MooseStack:** TypeScript and Python examples showing implementation
   - Additional context, trade-offs, or when to apply
   - Reference links (optional)

### Best Practices for Context Efficiency

Skills are loaded on-demand — only the skill name and description are loaded at startup. The full `SKILL.md` loads into context only when the agent decides the skill is relevant. To minimize context usage:

- **Keep SKILL.md under 500 lines** — put detailed reference material in separate files
- **Write specific descriptions** — helps the agent know exactly when to activate the skill
- **Use progressive disclosure** — reference supporting files that get read only when needed
- **Individual rule files** — allows agents to read only relevant rules on-demand
- **File references work one level deep** — link directly from SKILL.md to supporting files

### Build System Requirements

Each skill should have a build package that:
- Validates rule structure and content
- Validates code examples (e.g., SQL syntax for database skills)
- Checks internal links
- Generates the compiled `AGENTS.md` file

For ClickHouse Best Practices, the build system:
- Uses Bun for fast execution
- Downloads ClickHouse binary for real SQL validation
- Parses markdown with YAML frontmatter
- Generates table of contents and numbered sections
- Supports version management

### Development Workflow

1. **Add a rule**: Create a new `.md` file in `rules/` following the template
2. **Validate**: Run `bun run validate` to check structure
3. **Validate code**: Run skill-specific validators (e.g., `bun run validate-sql`)
4. **Check links**: Run `bun run check-links`
5. **Build**: Run `bun run build` to generate `AGENTS.md`
6. **Test**: Verify the generated documentation is correct

### CI/CD Integration

Set up GitHub Actions (or similar) to:
1. Install dependencies
2. Run all validation scripts
3. Build documentation
4. Upload artifacts

See `.github/workflows/clickhouse-best-practices-ci.yml` for an example.

## Contributing Guidelines

- Keep rules focused and actionable
- Use real code that can be executed (avoid pseudo-code)
- Include performance metrics when possible
- Reference official documentation where relevant
- Test code examples before committing
- Follow the existing style and structure

## Impact Levels

Choose the appropriate impact level for rules:

- **CRITICAL**: 10× or more improvement, or prevents serious issues
- **HIGH**: 2-10× improvement, or significantly impacts scalability
- **MEDIUM-HIGH**: 25-100% improvement, or important for specific workloads
- **MEDIUM**: 10-25% improvement, or helpful for maintainability
- **LOW-MEDIUM**: 5-10% improvement, or nice-to-have optimizations
- **LOW**: Minor improvements or edge cases
