---
title: Preserve the Required Text Search Semantics
impact: HIGH
impactDescription: "Choose token, substring, phrase, or value predicates without changing results"
tags: [query, index, text, search, correctness]
---

## Preserve the Required Text Search Semantics

**Impact: HIGH**

Identify what a search must match before choosing its predicate. Native text search supports several operations, with different meanings and acceleration paths. `TYPE text` is generally available from 26.2; that does not make every later search capability available on every GA release.

- **Any token / all tokens** — `hasAnyTokens` / `hasAllTokens`: OR / AND over tokens; order, adjacency, and repeated-token counts are not required.
- **One token** — `hasToken`: Text-index use requires splitByNonAlpha; any/all is preferable for configurable analysis.
- **Substring** — `LIKE '%connect%'` or the intended string predicate: Includes substrings within larger words. Do not replace with token membership.
- **Prefix / suffix** — `startsWith`, `endsWith`, or corresponding LIKE: Preserves position within the original value; eligible pruning/dictionary paths depend on version and tokenizer.
- **Case-insensitive pattern** — `ILIKE`: Current text-index dictionary support has specific tokenizer/processing restrictions. It is not a blanket case-insensitive-index switch.
- **Regular expression** — `match`, eligible multi-match functions: Original regex semantics remain; token extraction may prune candidates. Do not claim every regex or a fuzzy predicate is indexed.
- **Ordered consecutive tokens** — `hasPhrase` (26.4+): Phrase semantics, not byte-for-byte substring semantics. Position storage for exact index evaluation is a separate experimental 26.7+ option.
- **Exact value / set membership** — `=`, `IN`, array `has`/`hasAny`/`hasAll`: Keep value/element semantics. Whole-value `array` tokenization can make selected predicates exact; other cases retain verification.
- **Map key, value, or pair** — Correct `mapKeys`/`mapValues` expression, or supported `keyValuePairs` lookup: Key and value existing somewhere in the same map do not prove they belong to the same pair.
- **Relevance, fuzzy matching, Lucene syntax** — Establish a separate capability or application layer: The native text index does not itself return BM25 scores, fuzzy ranking, or parse Lucene query strings.

**Incorrect (replacing a substring requirement with token membership):**

```sql
-- Requirement includes 'reconnection' because it contains 'connect'.
SELECT id FROM search_events
WHERE hasToken(body, 'connect');
```

**Correct (preserve the substring requirement):**

```sql
SELECT id FROM search_events
WHERE body LIKE '%connect%'
LIMIT 100;
```

**Correct (distinguish token conjunction from phrase search on 26.4+):**

```sql
-- Matches reversed order and separated occurrences too.
SELECT id FROM search_events
WHERE hasAllTokens(body, 'connection timeout')
LIMIT 100;

-- Requires the analyzed tokens consecutively in that order.
SELECT id FROM search_events
WHERE hasPhrase(body, 'connection timeout')
LIMIT 100;
```

With a compatible text index, string needles for any/all token search use its configured analysis. Array needles are already tokens: they bypass preprocessing and tokenization; configured postprocessing can still apply. Empty or entirely dropped needle tokens return false for both any/all functions. Needles must be constant String or Array(String). Any/all search on an array-valued haystack can match tokens across separate elements of the same row. Do not infer phrase or same-element matching from that result.

From 26.10, phrase search also accepts supported string-array haystacks and constant Array(String) needles. Array needle elements are ordered tokens (including duplicates): preprocessing/tokenization is bypassed, while postprocessing can still apply. Haystack tokens form one sequence per row, so a phrase can span array elements. An array-valued text index supplies candidates and retains phrase verification even with stored positions; exact positional direct read is limited to non-array indexed columns. Phrase matching follows analyzed tokens: separators can differ, and removing stop words can make formerly separated tokens adjacent. Test the intended phrase meaning before selecting a postprocessor.

SQL `AND`/`OR` can combine predicates. A Boolean combination does not guarantee every branch has an index path. A negative predicate can still execute as SQL, but negative-only search is not guaranteed to get useful posting-list pruning. `hasTokenCaseInsensitive` variants are not native text-index-aware; use an intentional normalized token-search design for that requirement.

Before performance comparisons, verify equal result sets. On older builds, disabling skip-index analysis or moving token functions outside WHERE/PREWHERE can change inherited preprocessing. The relevant fix is present in the initial 26.8 release; verify the deployed patch rather than assuming `use_skip_indexes = 0` is always neutral.

Reference: [Text-search functions](https://clickhouse.com/docs/sql-reference/functions/string-search-functions), [Stable predicate/mode selection](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Storages/MergeTree/MergeTreeIndexConditionText.cpp), [Text indexes](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/textindexes)
