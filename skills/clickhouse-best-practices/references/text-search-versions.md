# Native text search: version and evidence ledger

Reviewed 2026-11-16. Release baseline: [v26.10.4.207-stable](https://github.com/ClickHouse/ClickHouse/releases/tag/v26.10.4.207-stable), published 2026-11-13. Current master includes 26.11 development. A more recently published maintenance release in an older series does not define the newest feature baseline. This ledger records feature entry points, not a promise that every patch/build has identical behavior. Inspect `SELECT version()`, effective settings, available tokenizers, and plans.

| Version | Guidance |
|---|---|
| Before 25.12 | Historical experimental text/inverted implementations can have different formats and granularity behavior. Do not copy their setup/settings into current production guidance. |
| 25.12+ | Whole-part-style text-index scope with fixed 100000000 index granularity; supplied GRANULARITY is ignored. This scope retains posting-list row IDs. |
| 26.1+ | Older 64-token query limit removed. Do not repeat it as a current universal limit. |
| 26.2+ | TYPE text generally available; prefer it for new compatible text-search designs. tokenbf_v1/ngrambf_v1 are deprecated for that use, still implemented; generic bloom_filter is not deprecated. |
| 26.4+ | hasPhrase/matchPhrase introduced; dictionary-assisted LIKE paths and JSONAllPaths/JSONAllValues indexing. Direct read no longer depends on use_skip_indexes_on_data_read. |
| 26.7+ | Per-token postprocessor; experimental positional phrase index with support_phrase_search=1 and allow_experimental_text_index_phrase_search=1. Basic phrase function availability is separate. |
| 26.8+ | splitByRegexp, Chinese/ICU/Japanese tokenizer additions subject to build support. Index-analysis preprocessing consistency fix is present in initial 26.8, although a 26.9 changelog lists it. |
| 26.9+ | keyValuePairs tokenizer with released equality scope; splitByRegexp match_tokens option; broader eligible dictionary patterns. |
| 26.10+ | Phrase array haystacks/constant array needles and array tokenizer; array-index phrases still retain row verification. keyValuePairs adds restricted IN and mapContainsKeyValue. Single-needle multiSearchAny variants gain eligible dictionary evaluation. pfor codec is readable/optional; default remains none. New postings-intersection selector supersedes density thresholds. |
| 26.11 development at review | Documented pfor default change is not the 26.10 default. Compatibility older than 26.11 reverts that implicit default to none; explicit codec selections still win. Native text-index arrayJoin-element pruning added on master is absent from the inspected 26.10 implementation; do not promise it there. |

## Applying version gates

Use the deployed version/build and release-pinned implementation when current docs or master differ. Optional codec/position settings can impose stronger reader requirements than the basic TYPE text baseline. Verify compatible readers before rolling upgrades, restores, or rollback. Explicit pfor selections are not neutralized by compatibility.

## Primary sources

- [26.2 release](https://clickhouse.com/blog/clickhouse-release-26-02) and [FTS GA engineering explanation](https://clickhouse.com/blog/full-text-search-ga-release).
- [26.4 release](https://clickhouse.com/blog/clickhouse-release-26-04), [26.7 release](https://clickhouse.com/blog/clickhouse-release-26-07), [26.8 release](https://clickhouse.com/blog/clickhouse-release-26-08), [26.9 release](https://clickhouse.com/blog/clickhouse-release-26-09).
- [26.10 stable predicate planner](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Storages/MergeTree/MergeTreeIndexConditionText.cpp), [index validation](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Storages/MergeTree/MergeTreeIndexText.cpp), [tokenizer factory](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Interpreters/TokenizerFactory.cpp).
- [Current text-index docs](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/textindexes), [string-search functions](https://clickhouse.com/docs/sql-reference/functions/string-search-functions), [legacy skip-index status](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree#skip-index-types).

- [26.10 shipped phrase API](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Functions/hasPhrase.cpp#L345), [26.10 codec default](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Storages/MergeTree/MergeTreeSettings.cpp#L856), and [codec compatibility clarification](https://github.com/ClickHouse/ClickHouse/blob/12fe14cf/docs/reference/engines/table-engines/mergetree-family/textindexes.mdx#L1624).

This ledger should be checked with each feature update. A new server release does not automatically justify changing every rule; update the affected capability, its version gate, worked example, and acceptance case together.
