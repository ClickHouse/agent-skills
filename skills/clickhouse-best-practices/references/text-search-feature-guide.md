# Native full-text search: feature and analysis reference

Verified 2026-11-16 against ClickHouse **26.10.4.207 stable**. These capabilities are not all available on earlier versions. Read `text-search-versions.md` and discover the actual server version/build. This reference complements the five `query-index-text-*` rules; use the rules for the basic decision workflow.

## Start with the search contract

Record the data shape, language, case/accent policy, token versus substring versus phrase meaning, same-element/field requirements, required result ordering, and deployed version. Native text indexing accelerates compatible SQL predicates. It does not automatically supply a relevance-ranked search service, Lucene query parser, typo tolerance, stemming, synonyms, or language detection. SQL/application logic can implement additional behavior separately; assess its semantics and execution cost.

## Operations and execution modes

An **exact** index predicate supplies its result from postings. A **hint** adds a candidate row mask and retains the original predicate. **Pruning** reduces candidate granules and retains original evaluation. Unindexed parts and ineligible expressions still execute correctly through ordinary reads. Eligibility is narrower than function availability.

| Operation | Stable behavior and limits |
|---|---|
| `hasAnyTokens`, `hasAllTokens` | Exact token membership for compatible index expressions. Constant String or Array(String) needles. String needles inherit preprocessing, tokenization, postprocessing; array needles bypass the first two but still receive postprocessing. Token order/duplicates do not establish phrase semantics. Empty or entirely dropped needle tokens produce false for both functions. |
| `hasToken` | Text-index recognition requires `splitByNonAlpha`; use any/all for configurable analysis. `hasTokenOrNull` is a separate pruning-only path, with no pre/postprocessor. Case-insensitive hasToken variants are not native text-index-aware. |
| Equality and array membership | Exact only under eligible whole-value `array` tokenization without pre/postprocessing; tokenized values generally supply hints that require original verification. Do not equate all words present with equality. |
| Ordinary `IN` | Uses pruning, not exact predicate replacement or a virtual row hint. The 26.10 `keyValuePairs` constant-set path is a specific exception below. |
| `LIKE`, prefix, suffix | Dictionary search can accelerate eligible patterns; splitByNonAlpha and array have different restrictions. Split-by-nonalpha exact infix search needs one ASCII alphanumeric literal of at least the configured minimum (default 4), with no pre/postprocessor. Original-value prefix/suffix anchors generally still require verification. An ngrams tokenizer can supply token-derived candidates; matching grams alone does not prove the original pattern. |
| `ILIKE` | Stable dictionary support has tokenizer and Unicode-safety restrictions. For eligible preprocessed paths, only direct ASCII `lower`/`upper` is accepted, no postprocessor. Do not generalize this to lowerUTF8 or arbitrary normalizers. Preserve the original ILIKE semantics. |
| `match`, `multiMatchAny` | Eligible token extraction can prune granules; these regex predicates do not have the same exact/hint path as any/all. Every required alternative must be safely represented. Arbitrary regex or fuzzy search is not a blanket guarantee. |
| `multiSearchAny`, `multiSearchAnyUTF8` and case-insensitive variants | 26.10 adds an exact dictionary-scan path for **one** literal needle with eligible splitByNonAlpha/array analysis and LIKE/ILIKE safety restrictions. It can match inside a word. Multiple case-sensitive needles can instead use ordinary complete-token pruning when every alternative is safely represented. Case-insensitive variants have only the eligible single-needle dictionary path; multiple needles are not covered by it. |
| `hasPhrase` / `matchPhrase` | 26.4+: ordered, consecutive analyzed tokens, including repeated-token positions; no slop argument. 26.10 also supports string-array haystacks, constant Array(String) token needles, and the array tokenizer. Array needle tokens bypass preprocessor/tokenizer, still receive postprocessing, and preserve order/duplicates. Haystack tokens concatenate across array elements. Without stored positions, candidate hints require phrase verification; **array-valued indexes retain this verification even with positions**. Experimental positions can permit exact evaluation on compatible non-array indexed columns. |
| SQL Boolean operations | AND/OR compose SQL predicates, but each branch needs its own eligibility assessment. Negative-only queries and ubiquitous tokens may give little benefit. |
| Relevance / fuzzy / synonyms | No native BM25/TF-IDF score or Lucene parser from TYPE text. A postprocessor returns one String per token, not a synonym list. Other SQL functions or application scoring are separate capabilities and are not thereby indexed. |

See [stable mode selection](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Storages/MergeTree/MergeTreeIndexConditionText.cpp), [any/all processing](https://github.com/ClickHouse/ClickHouse/blob/v26.9.23.15-stable/src/Functions/hasAnyAllTokens.cpp#L221), and [phrase implementation](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Functions/hasPhrase.cpp).

## Data shapes and expression matching

A text index accepts one indexed expression with supported String/FixedString or string-array types and supported Nullable/LowCardinality wrappers. The query must match the indexed expression in a supported form; mathematical or linguistic equivalence is not sufficient. Inspect SHOW CREATE TABLE.

- String arrays combine tokens across the row. `hasAllTokens` can succeed with one token in each of two elements. It does not prove same-element matching. From 26.10, `hasPhrase` accepts string-array haystacks too: their tokens form one sequence and phrase matches can cross elements. Use an explicit element-local predicate when that is the requirement; array phrase support does not prove same-element matching or positional direct read.
- Combining fields into one indexed expression loses field boundaries. Retain field-specific conditions when the search contract requires them.
- `mapKeys(m)` and `mapValues(m)` index different information. A key somewhere and a value somewhere do not prove a matching key/value pair.
- `keyValuePairs` (26.9) accepts Map(String,String), including supported LowCardinality components, not arbitrary FixedString/Nullable pair types. It has no preprocessor, postprocessor, or position mode. 26.9 supports `m['key'] = 'nonempty constant value'`. In 26.10, `m['key'] IN ('v1', 'v2')` and `mapContainsKeyValue(m, 'key', 'value')` can also use exact postings. Lookup equality/IN uses the **first** duplicate-key occurrence; `mapContainsKeyValue` searches **every** occurrence. Lookup equality to `''` or an IN list containing `''` falls back because a missing key also yields the empty default; `mapContainsKeyValue(..., '')` can be indexed because it requires an actual entry. IN direct read requires an explicit constant set of supported strings: tuple-correlated sets are ineligible, subquery sets can prune but not direct-read, and mutable ENGINE=Set tables are not used. Other map-only predicates are not accelerated by this specialized tokenizer; retain suitable mapKeys/mapValues indexes for their separate workloads.
- Index a specific typed JSON path/expression for field-specific searches. `JSONAllPaths` addresses path presence. `JSONAllValues` exposes serialized values across paths; retain original typed/path predicates to preserve correlation and comparison semantics. These are candidate tools, not a generic JSON query engine.

See [expression and type validation](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Storages/MergeTree/MergeTreeIndexText.cpp), [supported shape analysis](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Storages/MergeTree/MergeTreeIndexConditionText.cpp), and [26.9 release](https://clickhouse.com/blog/clickhouse-release-26-09).

## Tokenizers and languages

Discover available tokenizer names with `SELECT * FROM system.tokenizers`; optional libraries/build configuration matter. Preview actual tokens with the documented `tokens` function for the chosen tokenizer. Analyze representative punctuation, Unicode, mixed scripts, accents, identifiers, and empty values before building a large index.

| Tokenizer | Configuration and suitability |
|---|---|
| `splitByNonAlpha` | Default. ASCII alphanumeric token runs; not a universal Unicode word segmenter. |
| `ngrams` | Default n=3; current stable factory requires n>=1. Do not assert a universal 8-character upper bound from older docs. Useful candidate generation for substring patterns; raises index/build cost and does not by itself prove exact matches. |
| `splitByString` | Nonempty separator strings; default is one literal space, not every whitespace character. |
| `array` (alias `keyword`) | Each input element/whole value is a token; preserves whole-value membership semantics under compatible conditions. |
| `sparseGrams` | Defaults min=3, max=100; min/max/cutoff must be coherent. Not a supported phrase tokenizer. |
| `asciiCJK` (aliases `unicodeWord`, `unicode_word`) | ASCII runs plus individual non-ASCII characters. It is not dictionary-based word segmentation for all languages. |
| `splitByRegexp` | 26.8 separator regex; 26.9 optional `match_tokens` boolean defaults false. In match mode, first capturing group or whole match produces tokens. No generic LIKE token extraction. Phrase plus postprocessing is rejected. |
| `chinese` | 26.8; Jieba dependency, default coarse_grained versus fine_grained. Not a phrase tokenizer in stable. |
| `icu` | 26.8; required locale and ICU build dependency. Supports phrase analysis; no generic LIKE extraction. |
| `japanese` | 26.8; MeCab dependency/dictionary. Uses surface forms; does not imply automatic stemming or phrase support. |
| `keyValuePairs` | 26.9 dedicated Map pair indexing; see shape restrictions above. |

For Japanese, server configuration uses `<tokenizer><japanese>` with `dictionary_location` and a 64-character SHA-256 `dictionary_sha`. Verify a suitable dictionary archive, integrity, build support, and replica consistency. See the [stable dictionary manager](https://github.com/ClickHouse/ClickHouse/blob/v26.9.23.15-stable/src/Interpreters/MecabDictionaryManager.cpp#L322) and [upstream XML layout example](https://github.com/ClickHouse/ClickHouse/blob/v26.9.23.15-stable/tests/integration/test_japanese_tokenizer/configs/mecab_tokenizer.xml). The latter's minimal dictionary path/hash are test fixtures, not production defaults.

The stable factory is the implementation authority for exact accepted parameters and aliases: [TokenizerFactory.cpp](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Interpreters/TokenizerFactory.cpp). Verify version/build support before producing DDL for a language-specific tokenizer.

## Processing stages and correctness

`preprocessor` transforms the whole value before tokenization and preserves array dimensionality. `postprocessor` (26.7) transforms each token to one String; an empty result removes the token. This is the place for supported stemming or deliberate stop-word removal. Neither stage is automatically enabled.

`lower` is ASCII-oriented; `lowerUTF8` is not a complete locale-aware case-folding/accent/Unicode-normalization policy. Choose transformations explicitly and test both indexing and query analysis. The stem signature is **`stem(word, language)`** with constant language; it expects lowercased words. For example, local 26.7 testing produces `running -> run`, `runs -> run`, but `ran -> ran`; stemming is not full linguistic lemmatization.

Stop-word removal changes phrase meaning: stored token positions are dense after removal, so a phrase can match across words that were removed. The supported stable phrase tokenizers are splitByNonAlpha, splitByString, splitByRegexp (without postprocessor), ngrams, asciiCJK, icu, and (26.10+) array. Do not promise phrase acceleration for every language tokenizer.

See [preprocessor](https://github.com/ClickHouse/ClickHouse/blob/v26.9.23.15-stable/src/Storages/MergeTree/MergeTreeIndexTextPreprocessor.cpp#L45), [postprocessor](https://github.com/ClickHouse/ClickHouse/blob/v26.9.23.15-stable/src/Storages/MergeTree/MergeTreeIndexTextPostprocessor.cpp#L150), and [text-index docs](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/textindexes).

## Settings and performance diagnosis

Inspect effective settings rather than setting every optimizer toggle. 26.10 defaults enable direct read, hinting, count optimization, dictionary scans, token/negative/pattern-bypass/header/posting caches, and lazy application. Lazy application can fall back to materialization for dictionary-pattern queries or older index formats; the default is not a guarantee of the actual path. `text_index_postings_intersection_algorithm` defaults to `auto` in 26.10 and supersedes the old density-threshold settings; do not copy obsolete tuning advice. `text_index_hint_max_selectivity` defaults 0.2; dictionary scans have minimum literal length 4 and an early-exit threshold of 50 large posting lists. These are optimizer controls, not guarantees of the resulting plan. Settings can change across releases and deployments.

Use EXPLAIN PLAN actions=1,indexes=1 to distinguish predicate replacement from a retained original plus virtual hint and from ordinary pruning. An eligible count-only query may show `ReadFromTextIndexCount` rather than a virtual filter; check `query_plan_optimize_count_from_text_index`. Compare identical results and actual read_rows/read_bytes/elapsed/ProfileEvents. Reading a projected text value, common postings, multiple broad alternatives, remote storage, and warm caches can dominate measured performance. No universal speedup follows from index existence or granules dropped.

Builder flush thresholds (100 million tokens or about 1 GiB estimated memory by default) govern construction behavior; they are not a hard total index-size limit. Extra tokens, ngrams, position storage, and multiple indexed expressions add storage/build/merge work. The per-part row-ID limit is 4,294,967,295 rows, not a table-wide limit.

See [stable query settings](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Core/Settings.cpp) and [MergeTree settings](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Storages/MergeTree/MergeTreeSettings.cpp).

## Lifecycle checklist

ADD INDEX covers new writes; MATERIALIZE INDEX builds historical coverage through mutations. Inspect mutation completion/failures and representative plans on relevant replicas. CLEAR INDEX removes index files for the chosen scope while retaining its definition; DROP INDEX removes the definition. Tokenizer or processing changes require a rebuild/migration and correctness checks. Current stable rejects duplicate indexed expression output names even when analysis options differ. `body` and `lower(body)` have different expression names and can coexist; two indexes on `body` cannot. For the same-expression replacement, use a planned DROP/ADD/MATERIALIZE sequence with a coverage gap, or a separate-table migration with validated cutover. Never drop the working index before approving and testing the replacement design. Plan partition-scoped materialization and resource use; do not force OPTIMIZE FINAL as a generic index setup step.

Use release-specific upgrade guidance for experimental-era indexes and optional newer formats. GA basic indexing does not imply experimental phrase position storage is GA.

The 26.10 posting-list codec default is `none`; `bitpacking` and `pfor` are options. `pfor` parts require readers at least 26.10. During rolling upgrades, consider replicas, older readers, restores, and rollback before choosing a codec. `text_index_serialization_version` is a preferred format and can be raised by explicit codec/position requirements. A `compatibility` pin does not neutralize an explicitly selected `posting_list_codec` or table-level codec setting. The documented 26.11 change to default `pfor` is separate: its implicit default reverts to `none` under compatibility older than 26.11, while explicit selections still win. Do not treat that development/default change as the 26.10 default. See [ALTER INDEX](https://clickhouse.com/docs/sql-reference/statements/alter/skipping-index).

## Worked experimental phrase-position example (26.7+)

The gate is a **MergeTree table setting**, and position storage is an index option. This optional feature remains experimental at the reviewed stable baseline.

```sql
CREATE TABLE phrase_events
(
    id UInt64,
    body String,
    INDEX body_text body TYPE text(
        tokenizer = splitByNonAlpha,
        support_phrase_search = 1
    )
)
ENGINE = MergeTree
ORDER BY id
SETTINGS allow_experimental_text_index_phrase_search = 1;

INSERT INTO phrase_events VALUES
    (1, 'quick brown fox'), (2, 'quick fox'), (3, 'a quick fox');

SELECT id FROM phrase_events
WHERE hasPhrase(body, 'quick fox')
ORDER BY id;
-- Expected ids: 2, 3. This is analyzed-token adjacency.

EXPLAIN PLAN actions = 1, indexes = 1
SELECT count() FROM phrase_events
WHERE hasPhrase(body, 'quick fox');
```

For an existing table, configure the appropriate table setting before adding the positional index, then MATERIALIZE INDEX for historical parts and monitor system.mutations. Do not add a second index on the same expression to an already indexed table. A matching EXPLAIN predicate replacement is evidence of the chosen path; this tiny fixture is not a throughput benchmark.

See [stable duplicate-expression validation](https://github.com/ClickHouse/ClickHouse/blob/v26.9.23.15-stable/src/Storages/MergeTree/MergeTreeData.cpp#L1225) and [index expression naming](https://github.com/ClickHouse/ClickHouse/blob/v26.9.23.15-stable/src/Storages/IndicesDescription.cpp#L147).

## Worked 26.10 additions

These small examples demonstrate semantics; use EXPLAIN actions and indexes for the actual workload. The phrase example deliberately crosses array-element boundaries.

```sql
SELECT
    hasPhrase(['quick', 'fox'], 'quick fox') AS crosses_elements,
    hasPhrase(['quick', 'fox'], ['quick', 'fox'], 'array') AS token_sequence;
-- Both return 1 on 26.10.

CREATE TABLE search_attributes
(
    id UInt64,
    attributes Map(String, String),
    INDEX attributes_text attributes TYPE text(tokenizer = keyValuePairs)
)
ENGINE = MergeTree ORDER BY id;

INSERT INTO search_attributes VALUES
    (1, map('level', 'info', 'level', 'error')),
    (2, map('level', 'error')),
    (3, map('level', ''));

SELECT id FROM search_attributes
WHERE attributes['level'] IN ('error', 'warning') ORDER BY id;
-- 2: lookup uses the first occurrence.
SELECT id FROM search_attributes
WHERE mapContainsKeyValue(attributes, 'level', 'error') ORDER BY id;
-- 1, 2: all occurrences are considered.
SELECT id FROM search_attributes
WHERE mapContainsKeyValue(attributes, 'level', '') ORDER BY id;
-- 3: requires an actual empty-valued entry.

EXPLAIN PLAN actions = 1, indexes = 1
SELECT count() FROM search_events
WHERE multiSearchAny(body, ['connect']);
-- Uses the search_events splitByNonAlpha index from the native rule.
-- Check eligible single-needle dictionary evaluation, not a multi-needle promise.
```

Source anchors: [phrase arrays and tokens](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Functions/hasPhrase.cpp#L345), [phrase exact/hint selection](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Storages/MergeTree/MergeTreeIndexConditionText.cpp#L366), [single-needle dictionary path](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Storages/MergeTree/MergeTreeIndexConditionText.cpp#L1764), [Map pair predicates](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Storages/MergeTree/MergeTreeIndexConditionText.cpp#L2091).
