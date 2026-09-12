---
name: clickhouse-managed-postgres-rca
description: Investigate performance on ClickHouse-managed Postgres using Prometheus metrics and Slow Query Patterns. Produces evidence-based diagnostic findings and recommended fixes.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.2.0"
---

# ClickHouse Managed Postgres RCA

Use system metrics and per-pattern evidence to investigate the reported symptom. This diagnostic workflow recommends fixes; it does not modify the instance. Preserve the incident window and reuse evidence already supplied rather than recollecting it by default.

## Gather the evidence needed

- Reuse authorized credentials and known organization/instance identifiers. Inspect available configuration or selected service context before asking for missing access; do not request secrets in chat when a configured connection is available.
- For live calls, resolve the Beta API paths, parameters, and response fields from the current OpenAPI schema or a verified recent mapping: [API discovery](rules/openapi-discovery.md).
- [Prometheus](rules/prometheus-scrape.md): start with system gauges. Collect counter deltas only when they would distinguish a relevant hypothesis; a single current scrape cannot establish the whole incident history.
- [Slow Query Patterns](rules/slow-query-patterns-fields.md): request the incident window, retain relevant error/latency patterns, and derive ratios from actual fields. These endpoints can be queried independently once their request shapes and auth are known.

An empty slow-pattern list or healthy gauges do not disprove a reported incident. Check coverage, timing, filters, and unavailable signals. If one source is unavailable, report what the remaining evidence supports and the specific gap.

## Interpret and recommend

Read [triage](rules/triage.md) and the matching hypothesis references:

- [Full scan / expensive reads](rules/heuristic-full-scan.md)
- [Hot loop / N+1](rules/heuristic-hot-loop.md)
- [Write congestion](rules/heuristic-write-congestion.md)

These APIs do not by themselves supply plans, scan-type counters, or vacuum timestamps. Do not claim those were observed. Use plans or logs if separately supplied; otherwise identify which evidence would distinguish competing causes.

Lead with the supported finding and next action. Include the relevant time window, actual metrics, hypothesis/alternatives, and verification approach. The [report template](rules/output-template.md) is optional for a full RCA. Follow the [diagnostic boundary](rules/recommend-only.md); a recommendation is not authorization to execute it.

[AGENTS.md](AGENTS.md) is an optional compiled reference. Load individual rules for focused work.
