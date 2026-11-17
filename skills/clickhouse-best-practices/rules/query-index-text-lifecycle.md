---
title: Materialize Text Indexes and Verify Existing-Part Coverage
impact: HIGH
impactDescription: "Avoid assuming newly declared indexes accelerate historical data"
tags: [query, index, text, materialize, migration]
---

## Materialize Text Indexes and Verify Existing-Part Coverage

**Impact: HIGH**

Adding a text index changes table metadata and indexes newly written data. Existing parts need materialization before they benefit. Queries remain correct when some parts lack the index, but those parts can require scanning. Account for index build CPU, memory, disk, and mutation work before a large backfill. The reviewed implementation rejects materialization when a single part exceeds 4,294,967,295 rows; distinguish a large table from one oversized part.

**Incorrect (assuming ADD INDEX has indexed all historical rows):**

```sql
CREATE TABLE historical_events (id UInt64, body String)
ENGINE = MergeTree ORDER BY id;

ALTER TABLE historical_events
ADD INDEX body_text_new body TYPE text(tokenizer = splitByNonAlpha);
-- Index metadata exists; this alone does not prove historical-part coverage.
```

**Correct (materialize an added index and inspect completion):**

```sql
ALTER TABLE historical_events MATERIALIZE INDEX body_text_new;

SELECT mutation_id, command, is_done, parts_to_do, latest_fail_reason
FROM system.mutations
WHERE database = currentDatabase() AND table = 'historical_events'
ORDER BY create_time DESC;
```

Materialization is asynchronous by default. For a deliberately synchronous operation, select an appropriate `mutations_sync` setting; `2` waits for all replicas and can take time. For large tables, plan partition-scoped materialization where appropriate and monitor resource use. Verify the actual query plan after completion and check relevant replicas rather than interpreting a metadata row as proof of completion.

`CLEAR INDEX` removes index files in the selected scope while retaining the definition; `DROP INDEX` removes the definition. Extra tokens, ngrams, and optional positions increase build, merge, and storage work. Do not use `OPTIMIZE FINAL` as a generic index setup step.

Treat a change to tokenizer, preprocessing, or postprocessing as a search-schema change: plan a rebuild or migration to the desired definition and test result semantics and coverage. Current stable rejects two text indexes with the same indexed expression output name, even if their tokenizer or preprocessor differs. Indexes on `body` and `lower(body)` are distinct expressions and can coexist, but queries must match the intended expression and semantics. A replacement on the same expression therefore needs a planned drop/add/materialize sequence or a separate-table migration; budget the period without coverage. Do not silently change token boundaries or normalize only one side of a query.

Avoid copying experimental text-index storage settings or old `inverted` examples into current production DDL. Use version-specific upgrade/rebuild guidance when an existing index predates the current implementation. Newer optional features can have additional format or compatibility requirements even when basic `TYPE text` is generally available. The `pfor` posting-list codec is readable from 26.10, whose default remains `none`; do not explicitly enable it until every possible reader supports it. `text_index_serialization_version` is a preference, not a hard safety cap: explicit codec/position options can require a newer format. A `compatibility` pin does not override an explicitly selected codec.

Reference: [Text-index creation and materialization](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/textindexes#creating-a-text-index), [ALTER INDEX](https://clickhouse.com/docs/sql-reference/statements/alter/skipping-index), [Mutations](https://clickhouse.com/docs/operations/system-tables/mutations)
