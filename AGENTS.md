# Working on ClickHouse agent skills

This repository contains skills for ClickHouse, chDB, Node.js clients, Postgres operations and ClickStack ingestion. Edit the skill relevant to the task; the top-level README lists the available skills.

## Layout and sources

Each skill has a required `skills/<kebab-case-name>/SKILL.md`. Supporting files differ by purpose:

- `clickhouse-best-practices/rules/` contains source rules; `packages/clickhouse-best-practices-build/` generates that skill's `AGENTS.md`.
- chDB and Node.js skills keep API details and examples in supporting Markdown files; the RowBinary skill also ships codec source and tests.
- Workflow skills use `ref/` or `references/` for operational recipes. They do not need a rule compiler.
- Some skills maintain `metadata.json` and a `README.md`; keep them consistent when present. Do not create duplicate documentation solely to fill a template.
- `.claude-plugin/marketplace.json` lists the currently packaged plugins. The root `.claude-plugin/plugin.json` describes the best-practices plugin.

Read a skill's own maintainer guidance before changing it. Preserve historical benchmark/eval reports as records; do not rewrite their results to match new guidance.

## Authoring

Use YAML frontmatter with a matching `name`, a specific `description`, the applicable `license`, and skill version under `metadata`. The description should identify the task and relevant technology; avoid catch-all triggers that turn a generic SQL, pandas or app question into an installation or migration.

Keep `SKILL.md` focused on selection, task-specific constraints and links to supporting details. Aim below 500 lines, but judge context cost by what the agent actually reads, not line count alone. Link directly to relevant supporting files. Do not require every reference or the compiled guide for a narrow task.

Preserve domain knowledge, API contracts, operational invariants and useful examples. Replace generic model coaching, fixed answer ceremonies and repeated absolute language with a clear outcome and conditions for applying the advice. Use stronger prescriptions where a real format, protocol or data constraint requires them.

Use the user's available context and authorization. Skills should not require repeated questions, blanket command allowlists, new infrastructure or unrelated changes when the requested work does not need them. Operational examples should preserve existing resources and credentials on retries, and distinguish proposed actions from actions executed.

Qualify workload- and version-dependent advice. Preserve query semantics: nulls, duplicates, ordering, precision and time windows are not expendable performance details. State the evidence behind performance claims; do not assign numeric speedups solely from an impact label.

## Best-practices rules

Use `rules/_template.md` and section prefixes from `rules/_sections.md`. Rules have `title`, `impact`, optional `impactDescription`, and `tags` frontmatter. Explain applicability and tradeoffs, include real SQL examples and link to official documentation. Use incorrect/correct labels when one example is wrong; use descriptive labels when comparing valid alternatives.

Impact levels (`CRITICAL`, `HIGH`, `MEDIUM-HIGH`, `MEDIUM`, `LOW-MEDIUM`, `LOW`) prioritize likely consequences. Any quantitative benefit needs workload, version and measurement context; the label is not a benchmark.

Edit rule sources, then regenerate `skills/clickhouse-best-practices/AGENTS.md`. Do not hand-edit that generated guide. Other `AGENTS.md` files may be maintained navigation or compiled documents; inspect their header rather than assuming the same build process.

## Validation

For best-practices changes, from `packages/clickhouse-best-practices-build/`:

```bash
bun install --frozen-lockfile
bun run validate
bun run test
bun run validate-sql
bun run check-links
bun run build
bunx tsc --noEmit
```

SQL validation requires a ClickHouse binary (`CLICKHOUSE_BINARY` or `clickhouse` on PATH). CI installs a pinned release. The validator uses `clickhouse format` on every SQL fence: it checks parsing without executing queries. It does not prove schema compatibility, result equivalence or performance. Confirm generated output is current and `git diff --check` is clean.

For other skills, validate frontmatter, versions, relative links, referenced/packaged assets and the examples affected by the change. Run relevant existing code tests when changing executable code. Use disposable infrastructure for integration tests; do not provision cloud services just to validate Markdown. Record what was actually tested and what remains unverified.

A behavioral evaluation is separate from static validation. Any external eval harness should pin model, agent environment, skill revision and fixtures; compare no skill, baseline and candidate with realistic negative cases. The eval proposal lives under `docs/` when present and is not an implemented runner.

## Review boundaries

Keep a skill change together with its required metadata, packaging and build updates. Separate shared maintenance guidance and eval proposals so reviewers can adopt them independently. Follow the user's requested commit boundaries and PR state. State concrete behavior changes and validation limits in the PR; do not claim model-quality improvements without eval results.
