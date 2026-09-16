# Comprehensive ClickHouse reviews

Use this checklist when the user requests a broad review. Select checks that apply to the supplied schema, workload, or ingestion design; there is no required reading order or need to inspect unrelated tables.

## Schema

- Match sorting/primary keys to important filters and access patterns; use cardinality to refine the order among useful columns.
- Preserve nullability, numeric range, timestamp precision, and identifier semantics when choosing types.
- Evaluate LowCardinality with the actual distribution and workload.
- Choose partitions for lifecycle requirements and bounded part growth; no partitioning can be appropriate.
- For replacement/collapse engines, check row identity, version/sign handling, and how queries produce correct results before merges.

## Queries

- Preserve result rows, multiplicity, time range, and NULL behavior.
- Inspect relevant plans and available indexes/projections before proposing rewrites or new indexes.
- Check JOIN pushdown, algorithm support, and memory needs. ANY and dictionaries require compatible match semantics.
- Evaluate materialized views against freshness, backfill, update behavior, and insert overhead.

## Ingestion

- Assess synchronous batch size and partition fan-out; consider asynchronous buffering when client batching is impractical.
- Check acknowledgements and error handling, update/delete frequency, and engine/version compatibility.
- Investigate recurring OPTIMIZE FINAL jobs rather than treating them as routine maintenance.

## Reporting

Lead with actionable findings, prioritized by correctness and likely impact. For each, give the evidence, recommendation, relevant reference, and a way to verify it. Explain meaningful trade-offs and missing evidence. List successful checks only when useful or requested; do not call a workload-dependent choice a violation merely because it differs from an example.
