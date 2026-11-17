---
title: Use Data Skipping Indices for Non-ORDER BY Filters
impact: HIGH
impactDescription: "Up to 60x faster queries by skipping irrelevant granules"
tags: [query, index, skipping, bloom_filter]
---

## Use Data Skipping Indices for Non-ORDER BY Filters

**Impact: HIGH**

Filters on columns outside ORDER BY often need an additional access path to avoid scanning candidate data. Conventional data skipping indices store summaries for blocks and skip granules that definitely do not match. Their usefulness depends on the predicate and the distribution of values within blocks.

Native `TYPE text` indexes additionally store token-to-row-ID posting lists. For text search, read `query-index-text-native`, `query-index-text-semantics`, and `query-index-text-plan`; do not apply block-summary selectivity or GRANULARITY advice to text indexes without checking their execution path.

**Important:** Evaluate conventional skipping indices alongside the table's data types, primary key, and workload. Native text indexes are a purpose-built access path for text search and should be considered during search schema design.

**When to use:**
- High overall cardinality but low cardinality within blocks
- Rare values critical for search (error codes, specific IDs)
- Column correlates with primary key

**When NOT to use:**
- As a first optimization step
- Conventional block-summary indexes when nearly every block contains a match
- Without testing on real data

**Incorrect (filtering on non-ORDER BY column):**

```sql
CREATE TABLE events (
    event_type LowCardinality(String),
    timestamp DateTime,
    user_id UInt64    -- Not in ORDER BY
)
ENGINE = MergeTree()
ORDER BY (event_type, toDate(timestamp));

-- Query filters on user_id - scans all matching event_type
SELECT * FROM events
WHERE event_type = 'click' AND user_id = 12345;
```

**Correct (add skipping index):**

```sql
CREATE TABLE events (
    event_type LowCardinality(String),
    timestamp DateTime,
    user_id UInt64,
    INDEX idx_user_id user_id TYPE bloom_filter GRANULARITY 4
)
ENGINE = MergeTree()
ORDER BY (event_type, toDate(timestamp));

-- Or add to existing table
ALTER TABLE events ADD INDEX idx_user_id user_id TYPE bloom_filter GRANULARITY 4;
ALTER TABLE events MATERIALIZE INDEX idx_user_id;
```

**Index types:**

| Type | Best For | Example Filter |
|------|----------|----------------|
| `bloom_filter` | Equality on high-cardinality | `WHERE user_id = 123` |
| `set(N)` | Low cardinality (N unique values) | `WHERE status IN ('a','b')` |
| `minmax` | Range queries | `WHERE amount > 1000` |
| `text` | Native text search; GA in 26.2+ | `WHERE hasAllTokens(text, 'connection timeout')` |
| `ngrambf_v1`, `tokenbf_v1` | Deprecated legacy text-search indexes; inspect compatibility before migrating | Existing deployments only |

The deprecation applies to the two legacy text index types, not to the generic `bloom_filter` index. Predicate support and direct-read eligibility for `text` depend on tokenizer and version; see the dedicated rules.

**Validation:**

```sql
EXPLAIN indexes = 1
SELECT * FROM events WHERE user_id = 12345;
-- Look for "Skip" in output showing granules skipped
```

Reference: [Use Data Skipping Indices Where Appropriate](https://clickhouse.com/docs/best-practices/use-data-skipping-indices-where-appropriate), [Text indexes](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/textindexes)
