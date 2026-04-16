---
name: clickhouse-architecture-advisor
description: "Provides workload-aware architecture decisioning for ClickHouse — selects table engines, designs partition strategies, chooses ingestion patterns (Kafka vs batch vs async inserts), evaluates ReplacingMergeTree vs AggregatingMergeTree trade-offs, and plans data modeling for specific workloads (observability, SIEM, product analytics, IoT, financial services). Use when designing a ClickHouse architecture, selecting between ingestion or modeling patterns, planning schema design, choosing MergeTree variants, building a data pipeline, or evaluating OLAP trade-offs. Complements clickhouse-best-practices (implementation-level rule checks) with higher-level decision frameworks and provenance-labeled recommendations."
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.1.0"
---

# ClickHouse Architecture Advisor

This skill adds workload-aware architecture decisioning on top of `clickhouse-best-practices`.

> **Official docs remain the source of truth.**
> This skill must always prefer official ClickHouse documentation when available.

## Required behavior

Before producing recommendations:

1. Identify the workload shape
   - observability
   - security / SIEM
   - product analytics
   - IoT / telemetry
   - market data / financial services
   - mixed OLAP with point-lookups
2. Read the relevant decision rule files in `rules/`
3. Use `mappings/doc_links.yaml` to attach official documentation
4. Classify every recommendation as:
   - `official`
   - `derived`
   - `field`
5. Never present field guidance as official guidance
6. If a recommendation is uncertain, say so explicitly
7. Verify each recommendation's provenance by confirming the linked documentation actually supports the claim before presenting

## Provenance rules

Classify every recommendation with one of these labels:

- **`official`** — directly backed by official ClickHouse documentation.
- **`derived`** — follows logically from documented behavior but is not stated verbatim.
- **`field`** — experience-based, situational guidance. When using this label, include a disclaimer that the advice is heuristic, link a partially relevant official doc, and explain why the advice depends on workload context.

Never present `field` guidance as official guidance. If uncertain, say so explicitly.

## Read these rule files by scenario

### Real-time ingestion design
1. `rules/decision-ingestion-strategy.md`
2. `rules/decision-real-time-preaggregation.md`
3. Relevant best-practices insert rules

### Time-series and retention design
1. `rules/decision-partitioning-timeseries.md`
2. Relevant best-practices schema partition rules

### Enrichment and dimension lookups
1. `rules/decision-join-enrichment.md`
2. Relevant best-practices query join rules

### Mutable state / late-arriving events
1. `rules/decision-late-arriving-upserts.md`
2. Relevant best-practices mutation avoidance rules

## Output format

Structure responses like this:

```markdown
## Workload Summary
- workload:
- latency target:
- data shape:
- primary query patterns:
- operational constraints:

## Key Decisions
- ...
- ...

## Recommendations

### <Recommendation title>

**What**
...

**Why**
...

**How**
...

**Category**
official | derived | field

**Confidence**
high | medium | heuristic

**Source**
- doc link(s)

**Validation**
- concrete SQL, metric, or smoke test
```

## Example: Observability Ingestion Decision

```sql
-- Validate ingestion throughput after choosing async inserts
SELECT
    table,
    formatReadableSize(sum(bytes_on_disk)) AS size,
    sum(rows) AS total_rows,
    count() AS part_count
FROM system.parts
WHERE active AND table = 'otel_traces'
GROUP BY table;
```

Use queries like this to validate that the chosen architecture meets throughput and storage targets. See `examples/` for full worked examples across workload types.

## Architecture-specific guidance

Prefer decision frameworks over generic advice. Good responses should:
- explain tradeoffs
- identify the likely operating bottleneck
- separate immediate actions from structural redesign
- provide target architecture patterns, not just isolated settings

## Full reference

See `AGENTS.md` for the compiled version and `examples/` for sample outputs.
