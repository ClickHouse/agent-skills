---
title: Verify the Text Index Execution Path
impact: HIGH
impactDescription: "Distinguish exact posting-list filters, candidate hints, and scan fallback"
tags: [query, index, text, explain, diagnosis]
---

## Verify the Text Index Execution Path

**Impact: HIGH**

Inspect the actual query plan and representative reads before claiming an index will make a query efficient. Native text indexes have three useful execution behaviors: exact posting-list evaluation, a candidate hint plus the original predicate, and conventional granule skipping followed by predicate evaluation. Parts without the index can also require scans.

**Incorrect (treating index presence or granularity as proof of the execution path):**

```sql
SELECT name, type_full, expr, granularity
FROM system.data_skipping_indices
WHERE database = currentDatabase() AND table = 'search_events';
-- This metadata alone does not establish direct read, selectivity, or coverage.
```

**Correct (inspect both actions and index pruning):**

```sql
SELECT version();

EXPLAIN PLAN actions = 1, indexes = 1
SELECT count()
FROM search_events
WHERE hasAllTokens(body, 'connection timeout');

SELECT name, value, default
FROM system.settings
WHERE name IN
(
    'use_skip_indexes',
    'use_skip_indexes_on_data_read',
    'query_plan_direct_read_from_text_index',
    'query_plan_optimize_count_from_text_index',
    'query_plan_text_index_add_hint',
    'text_index_hint_max_selectivity'
)
ORDER BY name;
```

Look for a `__text_index_...` virtual filter and the expressions/columns read. An eligible count-only query can instead use `ReadFromTextIndexCount` (shown as a trivial count from the text index); absence of a virtual filter in that plan is not evidence of a scan. Discover `query_plan_optimize_count_from_text_index` when diagnosing that path. An exact index predicate can replace the original text predicate; a hint keeps the original predicate and adds a candidate filter. `Skip` identifies the index and reports parts/granules, but does not by itself prove direct read or that the raw text was avoided. A count query and a query returning the text column have different read requirements.

Current defaults enable `query_plan_direct_read_from_text_index` and `query_plan_text_index_add_hint`. Hinting depends on direct read. For releases before 26.4, the documented direct-read path additionally requires `use_skip_indexes_on_data_read = 1`. Discover effective settings instead of overriding them indiscriminately.

**Correct (compare with conventional index filtering while preserving the predicate):**

```sql
EXPLAIN PLAN actions = 1, indexes = 1
SELECT count()
FROM search_events
WHERE hasAllTokens(body, 'connection timeout')
SETTINGS query_plan_direct_read_from_text_index = 0,
         query_plan_text_index_add_hint = 0;
```

For a controlled performance comparison, first verify identical result sets. Use representative terms, cold/warm conditions, projected columns, and the same data snapshot; inspect elapsed time, `read_rows`, `read_bytes`, and relevant ProfileEvents in `system.query_log` when available. Keep benchmark settings local to the comparison.

Low text-index pruning does not automatically imply no benefit: row filters may still avoid text reads or downstream work. Conversely, a common token can produce a large posting list, and returning wide text for many matches can dominate I/O. Do not infer physical bytes or a universal speedup from posting-list precision, granule counts, or a small synthetic example.

Reference: [EXPLAIN](https://clickhouse.com/docs/sql-reference/statements/explain), [Text-index settings](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/textindexes#direct-read), [Query log](https://clickhouse.com/docs/operations/system-tables/query_log)
