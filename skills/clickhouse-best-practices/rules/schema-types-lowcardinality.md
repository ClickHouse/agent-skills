---
title: Use LowCardinality for Repeated Strings
impact: HIGH
impactDescription: "Dictionary encoding for <10K unique values; significant storage reduction"
tags: [schema, data-types, LowCardinality, storage]
---

## Use LowCardinality for Repeated Strings

**Impact: HIGH**

String columns with repeated values store each value repeatedly. LowCardinality uses dictionary encoding for significant storage reduction.

**Incorrect (plain String for repeated values):**

```sql
CREATE TABLE events (
    country String,       -- "United States" stored 500M times
    browser String,       -- "Chrome" stored 300M times
    event_type String     -- "page_view" stored 800M times
) ENGINE = Memory;
```

**Correct (LowCardinality for low unique counts):**

```sql
CREATE TABLE events (
    country LowCardinality(String),      -- ~200 unique values
    browser LowCardinality(String),      -- ~50 unique values
    event_type LowCardinality(String)    -- ~100 unique values
) ENGINE = Memory;
```

**When to use LowCardinality:**

These are heuristics for dictionary cardinality, not a hard table-wide threshold. Distribution across parts and the queries matter.

| Unique Values | Recommendation |
|---------------|----------------|
| < 10,000 | Use LowCardinality |
| 10,000–100,000 | Benchmark both representations on representative data |
| > 100,000 | May perform worse; measure before choosing |

```sql
-- Check cardinality before deciding
SELECT uniq(column_name) FROM table_name;
```

**LowCardinality vs FixedString:**

Reserve `FixedString` for strictly fixed-length data (e.g., 2-char country codes). For most low-cardinality text, `LowCardinality(String)` outperforms `FixedString`.

```sql
CREATE TABLE countries (
    country_code FixedString(2), -- Fixed-width codes
    country_name LowCardinality(String)
) ENGINE = Memory;
```

References: [Select Data Types](https://clickhouse.com/docs/best-practices/select-data-types) · [LowCardinality](https://clickhouse.com/docs/sql-reference/data-types/lowcardinality)
