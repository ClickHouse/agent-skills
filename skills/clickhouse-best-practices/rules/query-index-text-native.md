---
title: Use Native Text Indexes for Text Search
impact: HIGH
impactDescription: "Find matching row IDs without scanning every text value"
tags: [query, index, text, full-text-search]
---

## Use Native Text Indexes for Text Search

**Impact: HIGH**

For token search on MergeTree tables, evaluate `TYPE text` on ClickHouse 26.2 or newer, where it is generally available. Discover the server version and existing index definition first. Older experimental text-index implementations and formats require their own version-specific guidance.

A text index accepts one supported string or string-array expression, including supported Nullable/LowCardinality wrappers. Query expressions must match the indexed expression in a supported form. Combined fields or arrays can lose field/element boundaries; retain explicit conditions when those boundaries matter.

A text index stores token dictionaries and posting lists of row IDs. It appears under `Skip` in EXPLAIN and in `system.data_skipping_indices`, but its information is finer than a conventional block-summary skipping index. Posting lists can prune granules, supply exact token-match filters, or provide candidate filters that still require checking the original text.

Do not diagnose a large text-index `GRANULARITY` as part-only filtering. Current text indexes use a fixed `100000000` granularity; supplied values are ignored. This gives the index broad scope within each part while preserving row IDs. The table's `index_granularity`, selected mark ranges, compressed data reads, and posting-list row IDs are different concepts. Omit `GRANULARITY` in new text-index examples.

**Incorrect (defaulting to legacy Bloom-filter token search on a supported release):**

```sql
CREATE TABLE search_events_legacy
(
    id UInt64,
    body String,
    INDEX body_tokens body TYPE tokenbf_v1(10240, 3, 0) GRANULARITY 1
)
ENGINE = MergeTree
ORDER BY id;
```

**Correct (evaluate a native text index for token membership):**

```sql
CREATE TABLE search_events
(
    id UInt64,
    body String,
    INDEX body_text body TYPE text(tokenizer = splitByNonAlpha)
)
ENGINE = MergeTree
ORDER BY id;

SELECT id
FROM search_events
WHERE hasAllTokens(body, 'connection timeout')
LIMIT 100;
```

This query requires both tokens, in any order. It does not require an adjacent phrase. Choose tokenization and normalization to match the intended search semantics; see `query-index-text-semantics`.

For eligible predicates, direct read evaluates the text predicate using posting lists and avoids reading the indexed text column solely to evaluate that predicate. Selecting `body`, evaluating residual predicates, or aggregating other columns can still require base-column reads. Row-ID precision does not promise one physical disk read per matching row.

`tokenbf_v1` and `ngrambf_v1` are documented as deprecated for new text-search designs. This does not mean existing indexes have been removed or that the generic `bloom_filter` index is deprecated. Keep legacy compatibility decisions explicit and verify the deployed version before migrating.

Reference: [Text indexes](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/textindexes), [Data skipping indexes](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree#skip-index-types), [Full-text search GA](https://clickhouse.com/blog/full-text-search-ga-release)
