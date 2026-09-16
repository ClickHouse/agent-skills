---
name: clickhouse-architecture-advisor
description: Compare ClickHouse architecture options for a specific workload, including ingestion, enrichment, mutable state, partitioning, and pre-aggregation. Use for system-design decisions and architecture reviews.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.2.0"
---

# ClickHouse Architecture Advisor

Choose architecture options from the workload's throughput, latency/freshness goals, query patterns, update semantics, and operating constraints. Reuse provided context; ask only for missing information that materially changes the decision, or state a reasonable assumption for a provisional recommendation.

## Evidence and scope

Distinguish documented capabilities (`official`), workload-specific inferences (`derived`), and experience-based heuristics (`field`). Cite the supporting official source and explain material assumptions. A heuristic is not official policy; do not invent field experience or measurements. Explicit category labels are useful in structured reviews, but ordinary answers can explain the distinction in prose.

Read relevant decision files and verify version-sensitive features against current official documentation or the target deployment. An architecture assessment does not authorize provisioning or data changes. Preserve the user's chosen deployment and scope unless they ask to compare alternatives.

## Decision references

- [Ingestion](rules/decision-ingestion-strategy.md): batching, asynchronous inserts, queues, and replay requirements.
- [Partitioning](rules/decision-partitioning-timeseries.md): retention, volume, and part growth.
- [Enrichment](rules/decision-join-enrichment.md): JOINs, dictionaries, denormalization, and refresh behavior.
- [Mutable state](rules/decision-late-arriving-upserts.md): late events, row identity, replacement, and collapse semantics.
- [Pre-aggregation](rules/decision-real-time-preaggregation.md): freshness, incremental maintenance, and recomputation.
- [Official source map](mappings/doc_links.yaml): links by decision area.

Use concrete best-practices rules when a schema or query detail needs them; reading another entire skill is not a prerequisite.

## Deliverable

Lead with the recommended option and the trade-off that decides it. Provide enough evidence and a validation approach to make the decision testable. Include DDL or a full target architecture only when it helps the requested decision.

For comprehensive reviews, see the optional [response example](examples/review-format.md). The [recommendation schema](schemas/recommendation_schema.yaml) is available when structured output is requested. [Scenario examples](examples/README.md) illustrate applications rather than fixed designs to copy.
