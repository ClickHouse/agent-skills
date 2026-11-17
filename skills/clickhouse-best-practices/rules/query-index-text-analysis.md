---
title: Choose Text Analysis for the Data and Search Language
impact: HIGH
impactDescription: "Keep document and query tokenization, normalization, and language behavior aligned"
tags: [query, index, text, tokenizer, unicode, language]
---

## Choose Text Analysis for the Data and Search Language

**Impact: HIGH**

Text analysis is part of the search schema. The pipeline is preprocessing of the whole value, tokenization, then optional token postprocessing. Changing it can change answers and index size. Discover the server version, `system.tokenizers`, and full index definition before selecting an analyzer.

- **Deliberate ASCII token boundaries** — `splitByNonAlpha`: Splits at non-alphanumeric ASCII characters; not a general natural-language segmenter.
- **Custom separators or extraction** — `splitByString`, `splitByRegexp`: Separator ordering/regex capture behavior changes tokens. Check deployed support and preview query needles as well as data.
- **Substring-oriented candidates** — `ngrams(N)`, `sparseGrams(...)`: More or larger token sets change build/storage/query cost; not automatic edit-distance matching.
- **Whole values or pre-tokenized elements** — `array` (`keyword` alias): Keeps each input value/array element as a token; useful for exact membership.
- **Mixed ASCII/CJK text** — `asciiCJK`: Non-ASCII characters can become individual tokens; not Chinese/Japanese morphological segmentation. Older names include `unicodeWord`/`unicode_word`.
- **Chinese words** — `chinese` (26.8+): Coarse/fine segmentation has different recall/storage tradeoffs; build support matters.
- **Locale-aware segmentation** — `icu(locale)` (26.8+): Requires an explicit locale and an ICU-enabled build.
- **Japanese morphology** — `japanese` (26.8+): Requires a configured MeCab dictionary; dictionary consistency across replicas matters.
- **Map key/value pairs** — `keyValuePairs` (26.9+): Specialized map tokenizer with processing/operation restrictions; verify the exact stable-version surface.

**Incorrect (assuming ASCII splitting provides language-aware segmentation):**

```sql
-- This preview does not establish Chinese word segmentation.
SELECT tokens('北京大学', 'splitByNonAlpha');
```

**Correct (discover support and preview the intended analysis):**

```sql
SELECT version();
SELECT * FROM system.tokenizers;
SELECT tokens('Connection-timeout: retry', 'splitByNonAlpha');
SELECT tokens(lowerUTF8('Connection-timeout: retry'), 'splitByNonAlpha');
```

**Correct (make normalization explicit in the search schema):**

```sql
CREATE TABLE normalized_events
(
    id UInt64,
    body String,
    INDEX body_text body TYPE text(
        tokenizer = splitByNonAlpha,
        preprocessor = lowerUTF8(body)
    )
)
ENGINE = MergeTree
ORDER BY id;

SELECT id FROM normalized_events
WHERE hasAllTokens(body, 'Connection timeout')
LIMIT 100;
```

Lowercasing is not automatically accent removal, Unicode normalization, transliteration, or locale-specific equivalence. Choose those transformations explicitly when required. A preprocessor can normalize/remove parts of the original text before tokenization; an arbitrary transformed expression need not remain equivalent to a raw LIKE predicate.

**Correct (explicit token stemming on a release supporting postprocessing, 26.7+):**

```sql
CREATE TABLE stemmed_events
(
    id UInt64,
    body String,
    INDEX body_text body TYPE text(
        tokenizer = splitByNonAlpha,
        preprocessor = lower(body),
        postprocessor = stem(body, 'en')
    )
)
ENGINE = MergeTree
ORDER BY id;

SELECT id FROM stemmed_events
WHERE hasAllTokens(body, 'running')
LIMIT 100;
```

`stem(word, language)` is a language-specific transformation, not lemmatization or a promise that every irregular form shares a stem. Check available languages and actual outputs. A postprocessor can drop tokens by returning an empty string, for example an explicit stop-word set. Dropped words cannot satisfy later searches; phrase positions can close over removed words. These are product semantics, not free performance optimizations.

Token-search functions normalize both sides through compatible index analysis. Ordinary equality/array/map predicates retain their original value semantics even when analyzed tokens help locate candidates. Verify empty needles, nulls, punctuation, Unicode, array needles, and partially indexed data on the target version.

Reference: [Text analysis options](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/textindexes#creating-a-text-index), [Stable tokenizer factory](https://github.com/ClickHouse/ClickHouse/blob/v26.10.4.207-stable/src/Interpreters/TokenizerFactory.cpp), [Text functions](https://clickhouse.com/docs/sql-reference/functions/string-search-functions)
