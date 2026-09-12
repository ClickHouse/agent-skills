# ClickHouse Architecture Advisor

This is a navigation guide, not a second set of mandatory instructions. Follow [SKILL.md](SKILL.md) for scope and evidence conventions, then read only the decision references needed by the task.

- [Ingestion strategy](rules/decision-ingestion-strategy.md)
- [Partitioning](rules/decision-partitioning-timeseries.md)
- [Enrichment](rules/decision-join-enrichment.md)
- [Late-arriving data and mutable state](rules/decision-late-arriving-upserts.md)
- [Pre-aggregation](rules/decision-real-time-preaggregation.md)

Use [scenario examples](examples/README.md), the [response format](examples/review-format.md), and the [recommendation schema](schemas/recommendation_schema.yaml) when their level of detail matches the requested deliverable. Documented capabilities, derived recommendations, and field heuristics must remain distinguishable.
