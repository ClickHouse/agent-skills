# ClickHouse Best Practices

**Version 0.5.0**  
ClickHouse Inc  
September 2026
ClickHouse 24.1+

> **Note:**  
> This document is mainly for agents and LLMs to follow when designing,  
> optimizing, or maintaining ClickHouse databases. Humans may also find it  
> useful, but guidance here is optimized for automation and consistency by  
> AI-assisted workflows.

---

## Abstract

Comprehensive best practices for ClickHouse database optimization. Covers schema design, query optimization, table engines, indexing strategies, materialized views, distributed operations, and operational best practices. Each rule includes detailed explanations, SQL examples comparing incorrect vs. correct implementations, and specific impact metrics to guide database design and query optimization. Diagnostic rules explain how to read system tables as evidence on a live service, including TOO_MANY_PARTS, stuck mutations, memory errors, insert deduplication, and materialized views that return wrong results.

---

## Table of Contents

1. [Schema Design](#1-schema-design) — **CRITICAL**
   - 1.1 [Avoid Nullable Unless Semantically Required](#11-avoid-nullable-unless-semantically-required)
   - 1.2 [Consider Starting Without Partitioning](#12-consider-starting-without-partitioning)
   - 1.3 [Filter on ORDER BY Columns in Queries](#13-filter-on-order-by-columns-in-queries)
   - 1.4 [Keep Partition Cardinality Low (100-1,000 Values)](#14-keep-partition-cardinality-low-100-1000-values)
   - 1.5 [Measure Compression Per Table and Column Before Tuning Types or Codecs](#15-measure-compression-per-table-and-column-before-tuning-types-or-codecs)
   - 1.6 [Minimize Bit-Width for Numeric Types](#16-minimize-bit-width-for-numeric-types)
   - 1.7 [Order Columns by Cardinality (Low to High)](#17-order-columns-by-cardinality-low-to-high)
   - 1.8 [Plan PRIMARY KEY Before Table Creation](#18-plan-primary-key-before-table-creation)
   - 1.9 [Prioritize Filter Columns in ORDER BY](#19-prioritize-filter-columns-in-order-by)
   - 1.10 [Understand Partition Query Performance Trade-offs](#110-understand-partition-query-performance-trade-offs)
   - 1.11 [Use Enum for Finite Value Sets](#111-use-enum-for-finite-value-sets)
   - 1.12 [Use JSON Type for Dynamic Schemas](#112-use-json-type-for-dynamic-schemas)
   - 1.13 [Use LowCardinality for Repeated Strings](#113-use-lowcardinality-for-repeated-strings)
   - 1.14 [Use Native Types Instead of String](#114-use-native-types-instead-of-string)
   - 1.15 [Use Partitioning for Data Lifecycle Management](#115-use-partitioning-for-data-lifecycle-management)
   - 1.16 [Verify TTL Deletion from Part Metadata, Not from Wall-Clock Time](#116-verify-ttl-deletion-from-part-metadata-not-from-wall-clock-time)
2. [Query Optimization](#2-query-optimization) — **CRITICAL**
   - 2.1 [Alias Every Materialized View Output Column to Its Target Column Name](#21-alias-every-materialized-view-output-column-to-its-target-column-name)
   - 2.2 [Choose an Aggregating Target Engine for GROUP BY Materialized Views](#22-choose-an-aggregating-target-engine-for-group-by-materialized-views)
   - 2.3 [Choose the Right JOIN Algorithm](#23-choose-the-right-join-algorithm)
   - 2.4 [Compare Individual Executions When a Query Gets Slower](#24-compare-individual-executions-when-a-query-gets-slower)
   - 2.5 [Consider Alternatives to JOINs](#25-consider-alternatives-to-joins)
   - 2.6 [Diagnose MEMORY_LIMIT_EXCEEDED Before Raising Limits](#26-diagnose-memory_limit_exceeded-before-raising-limits)
   - 2.7 [Diagnose Slow or Failing Inserts Through Their Materialized Views](#27-diagnose-slow-or-failing-inserts-through-their-materialized-views)
   - 2.8 [Filter Tables Before Joining](#28-filter-tables-before-joining)
   - 2.9 [Keep ReplacingMergeTree Versions of a Key in One Partition](#29-keep-replacingmergetree-versions-of-a-key-in-one-partition)
   - 2.10 [Materialized Views Read the Inserted Block, Not the Table](#210-materialized-views-read-the-inserted-block-not-the-table)
   - 2.11 [Optimize NULL Handling in Outer JOINs](#211-optimize-null-handling-in-outer-joins)
   - 2.12 [Query ClickPipes Postgres CDC Tables as Versioned Rows](#212-query-clickpipes-postgres-cdc-tables-as-versioned-rows)
   - 2.13 [Use ANY JOIN When Only One Match Needed](#213-use-any-join-when-only-one-match-needed)
   - 2.14 [Use Data Skipping Indices for Non-ORDER BY Filters](#214-use-data-skipping-indices-for-non-order-by-filters)
   - 2.15 [Use Incremental MVs for Real-Time Aggregations](#215-use-incremental-mvs-for-real-time-aggregations)
   - 2.16 [Use Refreshable MVs for Complex Joins and Batch Workflows](#216-use-refreshable-mvs-for-complex-joins-and-batch-workflows)
   - 2.17 [Verify That Indexes and Projections Are Actually Used](#217-verify-that-indexes-and-projections-are-actually-used)
3. [Insert Strategy](#3-insert-strategy) — **CRITICAL**
   - 3.1 [Account for the Read Cost of Lightweight DELETE Until Parts Merge](#31-account-for-the-read-cost-of-lightweight-delete-until-parts-merge)
   - 3.2 [Avoid ALTER TABLE DELETE](#32-avoid-alter-table-delete)
   - 3.3 [Avoid ALTER TABLE UPDATE](#33-avoid-alter-table-update)
   - 3.4 [Avoid OPTIMIZE TABLE FINAL](#34-avoid-optimize-table-final)
   - 3.5 [Batch Inserts Appropriately (10K-100K rows)](#35-batch-inserts-appropriately-10k-100k-rows)
   - 3.6 [Check asynchronous_insert_log When Using wait_for_async_insert=0](#36-check-asynchronous_insert_log-when-using-wait_for_async_insert0)
   - 3.7 [Diagnose Stuck Mutations Before Killing or Resubmitting](#37-diagnose-stuck-mutations-before-killing-or-resubmitting)
   - 3.8 [Diagnose TOO_MANY_PARTS Before Changing Thresholds](#38-diagnose-too_many_parts-before-changing-thresholds)
   - 3.9 [Retry Failed Inserts With the Same Data, Settings, and Token](#39-retry-failed-inserts-with-the-same-data-settings-and-token)
   - 3.10 [Use Async Inserts for High-Frequency Small Batches](#310-use-async-inserts-for-high-frequency-small-batches)
   - 3.11 [Use Native Format for Best Insert Performance](#311-use-native-format-for-best-insert-performance)
4. [Agent Integration](#4-agent-integration) — **CRITICAL**
   - 4.1 [Apply Safety Limits to Agent-Generated Queries](#41-apply-safety-limits-to-agent-generated-queries)
   - 4.2 [Connect AI Agents to ClickHouse](#42-connect-ai-agents-to-clickhouse)
   - 4.3 [Count Recent Errors From system.error_log, Not system.errors](#43-count-recent-errors-from-systemerror_log-not-systemerrors)
   - 4.4 [Discover Schema Before Querying](#44-discover-schema-before-querying)
   - 4.5 [Read System Log Tables as Bounded, Per-Replica Evidence](#45-read-system-log-tables-as-bounded-per-replica-evidence)

---

## 1. Schema Design

**Impact: CRITICAL**

Proper schema design is foundational to ClickHouse performance. ORDER BY is immutable after table creation; wrong choices require full data migration. Includes primary key selection, data types, partitioning strategy, and JSON usage. Column types and ordering can impact query speed by orders of magnitude.

### 1.1 Avoid Nullable Unless Semantically Required

**Impact: HIGH (Nullable adds storage overhead; use DEFAULT values instead)**

Nullable columns maintain a separate UInt8 column for tracking null values, increasing storage and degrading performance. Use DEFAULT values instead when feasible.

**Incorrect: Nullable everywhere**

```sql
CREATE TABLE users (
    id Nullable(UInt64),              -- IDs should never be null
    name Nullable(String),            -- Empty string is fine
    age Nullable(UInt8),              -- 0 is a valid default
    login_count Nullable(UInt32)      -- 0 is a valid default
)
```

**Correct: DEFAULT values, Nullable only when semantic**

```sql
CREATE TABLE users (
    id UInt64,                                    -- Never null
    name String DEFAULT '',                       -- Empty = unknown
    age UInt8 DEFAULT 0,                          -- 0 = unknown
    login_count UInt32 DEFAULT 0,                 -- 0 = never logged in
    deleted_at Nullable(DateTime),                -- NULL = not deleted (semantic!)
    parent_id Nullable(UInt64)                    -- NULL = no parent (semantic!)
)
```

**When Nullable IS appropriate:**

| Use Case | Why |

|----------|-----|

| `deleted_at` | NULL = "not deleted", timestamp = "deleted at X" |

| `parent_id` | NULL = "no parent", value = "has parent" |

| `discount_percent` | NULL = "no discount", 0 = "0% discount" |

**Defaults instead of Nullable:**

| Type | Default |

|------|---------|

| String | `''` (empty string) |

| UInt*/Int* | `0` |

| DateTime | `now()` or `toDateTime(0)` |

| UUID | `generateUUIDv4()` |

Reference: [https://clickhouse.com/docs/best-practices/select-data-types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.2 Consider Starting Without Partitioning

**Impact: MEDIUM (Add partitioning later when you have clear lifecycle requirements)**

Start without partitioning and add it later only if:

- You have clear data lifecycle requirements (retention, archiving)

- Your access patterns clearly benefit from partition pruning

- You understand the cardinality implications

**Example: start simple**

```sql
-- Start simple, no partitioning
CREATE TABLE events (
    timestamp DateTime,
    event_type LowCardinality(String),
    user_id UInt64
)
ENGINE = MergeTree()
ORDER BY (event_type, timestamp);

-- Add partitioning later if needed for lifecycle management
-- (requires table recreation or materialized view migration)
```

**When to add partitioning:**

| Need | Add Partitioning? |

|------|-------------------|

| Time-based data retention | Yes |

| Archive old data to cold storage | Yes |

| Query performance on time ranges | Maybe (test first) |

| No specific lifecycle needs | No |

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)

### 1.3 Filter on ORDER BY Columns in Queries

**Impact: CRITICAL (Skipping prefix columns prevents index usage)**

Even with good schema design, queries must use ORDER BY columns to benefit. Skipping prefix columns or filtering on non-ORDER BY columns prevents index usage.

**Incorrect: skips prefix or uses non-ORDER BY columns**

```sql
-- Given: ORDER BY (tenant_id, event_type, timestamp)

-- Skips prefix columns - can't use index effectively
SELECT * FROM events WHERE event_type = 'click';

-- Filter on column not in ORDER BY - full table scan
SELECT * FROM events WHERE user_agent LIKE '%Chrome%';
```

**Correct: uses ORDER BY prefix**

```sql
-- Given: ORDER BY (tenant_id, event_type, timestamp)

-- Full prefix match - best performance
SELECT * FROM events
WHERE tenant_id = 123 AND event_type = 'click';

-- Partial prefix - still uses index
SELECT * FROM events WHERE tenant_id = 123;

-- Range on later column after equality on earlier
SELECT * FROM events
WHERE tenant_id = 123 AND event_type = 'click' AND timestamp >= '2024-01-01';
```

**Index usage reference:**

| Filter | Index Used? |

|--------|-------------|

| `WHERE tenant_id = 123` | Full |

| `WHERE tenant_id = 123 AND event_type = 'click'` | Full |

| `WHERE event_type = 'click'` | None (skipped prefix) |

| `WHERE timestamp > '2024-01-01'` | None (skipped both) |

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-primary-key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)

### 1.4 Keep Partition Cardinality Low (100-1,000 Values)

**Impact: HIGH (Too many partitions cause part explosion and 'too many parts' errors)**

Too many distinct partition values create excessive data parts, eventually triggering "too many parts" errors. ClickHouse enforces limits via `max_parts_in_total` and `parts_to_throw_insert` settings.

**Incorrect: high cardinality partitioning**

```sql
-- High cardinality = too many partitions
CREATE TABLE events (...)
ENGINE = MergeTree()
PARTITION BY user_id  -- Millions of partitions!
ORDER BY (timestamp);

-- Daily partitions can grow unbounded over years
CREATE TABLE logs (...)
ENGINE = MergeTree()
PARTITION BY toDate(timestamp)  -- 3650 partitions over 10 years
ORDER BY (service, timestamp);
```

**Correct: bounded cardinality**

```sql
-- Monthly partitions = 12 per year, bounded cardinality
CREATE TABLE events (
    timestamp DateTime,
    event_type LowCardinality(String),
    user_id UInt64
)
ENGINE = MergeTree()
PARTITION BY toStartOfMonth(timestamp)
ORDER BY (event_type, timestamp);
```

**Validation:**

```sql
-- Check partition count and health
SELECT
    partition,
    count() as parts,
    sum(rows) as rows,
    formatReadableSize(sum(bytes_on_disk)) as size
FROM system.parts
WHERE table = 'events' AND active
GROUP BY partition
ORDER BY partition;

-- Warning signs: hundreds or thousands of partitions
```

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)

### 1.5 Measure Compression Per Table and Column Before Tuning Types or Codecs

**Impact: MEDIUM (Finds the few columns that dominate storage; compact parts hide per-column sizes)**

Storage is often dominated by a few columns. Measure before changing types or codecs, and read the right system table for each level:

- **Per table**: sum `data_compressed_bytes` and `data_uncompressed_bytes` over **active** parts in `system.parts`. Inactive parts are merged-away copies waiting for cleanup, and counting them inflates the totals.

- **Per column**: `system.columns` (table-wide totals, plus `compression_codec`) or `system.parts_columns` (per part). These only count **wide** parts. Compact parts store all columns in one file and report `0` for each column. In a table with many small or recent parts, the column totals add up to less than the table total from `system.parts`. Wide versus compact is controlled by `min_bytes_for_wide_part` and `min_rows_for_wide_part`, so check the effective values.

**Incorrect: sizing from every part, or trusting column sums alone**

```sql
-- Includes inactive parts, and ranks columns without checking how much data is in compact parts
SELECT table, sum(data_compressed_bytes) FROM system.parts GROUP BY table;
SELECT name, data_compressed_bytes FROM system.columns WHERE table = 'events';
```

**Correct: active parts per table, then columns, with the compact-part share visible**

```sql
-- A SETTINGS clause here replaces the source table's settings: repeat its overrides from SHOW CREATE TABLE
CREATE TABLE events_codec_test AS events SETTINGS min_bytes_for_wide_part = 0;
ALTER TABLE events_codec_test MODIFY COLUMN ts DateTime CODEC(Delta, ZSTD(1));
INSERT INTO events_codec_test SELECT * FROM events WHERE event_date = today() - 1;
OPTIMIZE TABLE events_codec_test FINAL;
```

To compare a candidate type or codec, copy a representative sample into a scratch table. Force wide parts so every column is measured, merge, and compare the same column in `system.parts_columns`:

For fixes, start with the type rules: [schema-types-lowcardinality](schema-types-lowcardinality.md), [schema-types-minimize-bitwidth](schema-types-minimize-bitwidth.md), [schema-types-native-types](schema-types-native-types.md), [schema-types-avoid-nullable](schema-types-avoid-nullable.md).

Reference: [https://clickhouse.com/docs/guides/clickhouse/data-modelling/compression/compression-in-clickhouse](https://clickhouse.com/docs/guides/clickhouse/data-modelling/compression/compression-in-clickhouse), [https://clickhouse.com/docs/reference/system-tables/parts](https://clickhouse.com/docs/reference/system-tables/parts)

### 1.6 Minimize Bit-Width for Numeric Types

**Impact: HIGH (Smaller types reduce storage and improve cache efficiency)**

Select the smallest numeric type that accommodates your data range. Prefer unsigned types when negative values aren't needed.

**Incorrect: oversized types**

```sql
CREATE TABLE metrics (
    status_code Int64,        -- HTTP codes are 100-599
    age Int64,                -- Human age fits in UInt8
    year Int64,               -- Years fit in UInt16
    item_count Int64          -- Often small numbers
)
```

**Correct: right-sized types**

```sql
CREATE TABLE metrics (
    status_code UInt16,       -- 0-65,535 (HTTP codes fit easily)
    age UInt8,                -- 0-255 (sufficient for age)
    year UInt16,              -- 0-65,535 (sufficient for years)
    item_count UInt32         -- 0-4 billion (adjust based on actual max)
)
```

**Numeric Type Reference:**

| Type | Range | Bytes |

|------|-------|-------|

| UInt8 | 0 to 255 | 1 |

| UInt16 | 0 to 65,535 | 2 |

| UInt32 | 0 to 4.3 billion | 4 |

| UInt64 | 0 to 18 quintillion | 8 |

| Int8 | -128 to 127 | 1 |

| Int16 | -32,768 to 32,767 | 2 |

| Int32 | -2.1 billion to 2.1 billion | 4 |

| Int64 | -9 quintillion to 9 quintillion | 8 |

Reference: [https://clickhouse.com/docs/best-practices/select-data-types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.7 Order Columns by Cardinality (Low to High)

**Impact: CRITICAL (Enables granule skipping; high-cardinality first prevents index pruning)**

Since the sparse primary index operates on data blocks (granules) rather than individual rows, low-cardinality leading columns create more useful index entries that can skip entire blocks. Place lower-cardinality columns before higher-cardinality ones in the ordering key.

**Incorrect: high cardinality first**

```sql
-- UUID first means no pruning benefit
CREATE TABLE events (...)
ENGINE = MergeTree()
ORDER BY (event_id, event_type, timestamp);
-- Every granule has different event_id values, index can't skip anything
```

**Correct: low cardinality first**

```sql
-- Low cardinality first enables pruning
CREATE TABLE events (...)
ENGINE = MergeTree()
ORDER BY (event_type, event_date, event_id);
-- Index can skip entire event_type groups
```

**Column Order Guidelines:**

| Position | Cardinality | Examples |

|----------|-------------|----------|

| 1st | Low (few distinct values) | event_type, status, country |

| 2nd | Date (coarse granularity) | toDate(timestamp) |

| 3rd+ | Medium-High | user_id, session_id |

| Last | High (if needed) | event_id, uuid |

**Tip:** Use `toDate(timestamp)` instead of raw `DateTime` columns when day-level filtering suffices - this reduces index size from 32-bit to 16-bit representations.

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-primary-key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)

### 1.8 Plan PRIMARY KEY Before Table Creation

**Impact: CRITICAL (ORDER BY is immutable; wrong choice requires full data migration)**

ClickHouse's ORDER BY clause defines physical data ordering and the sparse index. Unlike other databases, **ORDER BY cannot be modified after table creation**. A wrong choice requires creating a new table and migrating all data.

**Incorrect: arbitrary ORDER BY without query analysis**

```sql
-- Creating table without analyzing query patterns
CREATE TABLE events (
    event_id UUID,
    user_id UInt64,
    timestamp DateTime
)
ENGINE = MergeTree()
ORDER BY (event_id);  -- Chosen arbitrarily

-- Later: "Most queries filter by user_id!"
-- Cannot fix with: ALTER TABLE events MODIFY ORDER BY (user_id, timestamp)
-- ERROR: Cannot modify ORDER BY
```

**Correct: query-driven ORDER BY selection**

```sql
-- Step 1: Document query patterns BEFORE creating table
/*
Query Analysis:
- 60% of queries: WHERE user_id = ? AND timestamp BETWEEN ? AND ?
- 25% of queries: WHERE event_type = ? AND timestamp > ?
- 15% of queries: WHERE event_id = ?

Conclusion: user_id and event_type are primary filters
*/

-- Step 2: Create table with correct ORDER BY
CREATE TABLE events (
    event_id UUID DEFAULT generateUUIDv4(),
    user_id UInt64,
    event_type LowCardinality(String),
    timestamp DateTime,
    event_date Date DEFAULT toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (user_id, event_date, event_id);
```

**Pre-creation checklist:**

- [ ] Listed top 5-10 query patterns

- [ ] Identified columns in WHERE clauses with frequency

- [ ] Prioritized columns that exclude large numbers of rows

- [ ] Ordered columns by cardinality (low first, high last)

- [ ] Limited to 4-5 key columns (typically sufficient)

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-primary-key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)

### 1.9 Prioritize Filter Columns in ORDER BY

**Impact: CRITICAL (Columns not in ORDER BY cause full table scans)**

Prioritize columns frequently used in query filters (WHERE clause), especially those that exclude large numbers of rows. Queries filtering on columns not in ORDER BY result in full table scans.

**Incorrect: ORDER BY doesn't match query patterns**

```sql
-- If most queries filter by tenant_id:
CREATE TABLE events (...)
ENGINE = MergeTree()
ORDER BY (event_id);  -- Queries by tenant_id will full-scan!
```

**Correct: ORDER BY matches filter patterns**

```sql
-- ORDER BY matches query filter patterns
CREATE TABLE events (...)
ENGINE = MergeTree()
ORDER BY (tenant_id, event_date, event_id);

-- Query now uses primary index:
SELECT * FROM events WHERE tenant_id = 123 AND event_date >= '2024-01-01';
```

**Validation:**

```sql
-- Verify index usage
EXPLAIN indexes = 1
SELECT * FROM events WHERE tenant_id = 123;
-- Look for "PrimaryKey" with Key Condition
```

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-primary-key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)

### 1.10 Understand Partition Query Performance Trade-offs

**Impact: MEDIUM (Partition pruning helps some queries; spanning many partitions hurts others)**

Partitioning can help or hurt query performance:

- **Potential improvement**: Queries filtering by partition key may benefit from partition pruning

- **Potential degradation**: Queries spanning many partitions increase total parts scanned

ClickHouse automatically builds **MinMax indexes** on partition columns. Data merges occur **within partitions only**, not across them.

**Incorrect: query scans all partitions**

```sql
-- Query must scan all partitions
SELECT count(*) FROM events
WHERE event_type = 'click';  -- No partition pruning
```

**Correct: query prunes to single partition**

```sql
-- Query prunes to single partition
SELECT count(*) FROM events
WHERE timestamp >= '2024-01-01' AND timestamp < '2024-02-01'
  AND event_type = 'click';
```

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)

### 1.11 Use Enum for Finite Value Sets

**Impact: MEDIUM (Insert-time validation and natural ordering; 1-2 bytes storage)**

Enum types provide validation at insert time and enable queries that exploit natural ordering. Use Enum8 (up to 256 values) or Enum16 (up to 65,536 values).

**Incorrect: String without validation**

```sql
CREATE TABLE orders (
    status String    -- No validation, typos like "shiped" allowed
)

-- Ordering requires CASE statements
SELECT * FROM orders ORDER BY
    CASE status
        WHEN 'pending' THEN 1
        WHEN 'processing' THEN 2
        WHEN 'shipped' THEN 3
    END;
```

**Correct: Enum with validation and ordering**

```sql
CREATE TABLE orders (
    status Enum8('pending' = 1, 'processing' = 2, 'shipped' = 3, 'delivered' = 4)
)

-- Insert validation: invalid values rejected
INSERT INTO orders VALUES ('shiped');  -- ERROR: Unknown element 'shiped'

-- Natural ordering works automatically
SELECT * FROM orders ORDER BY status;  -- Orders by enum value (1, 2, 3, 4)

-- Comparisons use natural order
SELECT * FROM orders WHERE status > 'processing';  -- shipped and delivered
```

**Enum Guidelines:**

| Scenario | Use |

|----------|-----|

| Fixed set of values known at schema time | Enum8/Enum16 |

| Values may change frequently | LowCardinality(String) |

| Need insert-time validation | Enum |

| Need natural ordering in queries | Enum |

| < 256 distinct values | Enum8 (1 byte) |

| 256-65,536 distinct values | Enum16 (2 bytes) |

Reference: [https://clickhouse.com/docs/best-practices/select-data-types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.12 Use JSON Type for Dynamic Schemas

**Impact: MEDIUM (Field-level querying for semi-structured data; use typed columns for known schemas)**

ClickHouse's JSON type splits JSON objects into separate sub-columns, enabling field-level query optimization. Use it for truly dynamic data, not everything.

**Incorrect: schema bloat or opaque String**

```sql
-- BAD: Hundreds of nullable columns for event properties
CREATE TABLE events (
    event_id UUID,
    prop_page_url Nullable(String),
    prop_button_id Nullable(String),
    -- ... 100 more nullable columns
)

-- BAD: JSON as String when you need field queries
CREATE TABLE events (
    event_id UUID,
    properties String  -- No field-level optimization
)
```

**Correct: JSON for dynamic, typed for known**

```sql
-- Use JSON type for dynamic properties
CREATE TABLE events (
    event_id UUID DEFAULT generateUUIDv4(),
    event_type LowCardinality(String),
    timestamp DateTime DEFAULT now(),
    properties JSON  -- Flexible schema with type inference
)
ENGINE = MergeTree()
ORDER BY (event_type, timestamp);

-- Query JSON paths directly
SELECT
    event_type,
    properties.url as page_url,
    properties.amount as purchase_amount
FROM events
WHERE event_type = 'page_view' AND properties.url = '/home';
```

**When to use JSON:**

```sql
CREATE TABLE events (
    properties JSON(
        url String,
        amount Float64,
        product_id UInt64
    )
)
```

| Scenario | Use JSON? |

|----------|-----------|

| Data structure varies unpredictably | Yes |

| Field types/schemas change over time | Yes |

| Need field-level querying | Yes |

| Fixed, known schema | No (use typed columns) |

| JSON as opaque blob (no field queries) | No (use String) |

**Optimization: specify types for known paths:**

Reference: [https://clickhouse.com/docs/best-practices/use-json-where-appropriate](https://clickhouse.com/docs/best-practices/use-json-where-appropriate)

### 1.13 Use LowCardinality for Repeated Strings

**Impact: HIGH (Dictionary encoding for <10K unique values; significant storage reduction)**

String columns with repeated values store each value repeatedly. LowCardinality uses dictionary encoding for significant storage reduction.

**Incorrect: plain String for repeated values**

```sql
CREATE TABLE events (
    country String,       -- "United States" stored 500M times
    browser String,       -- "Chrome" stored 300M times
    event_type String     -- "page_view" stored 800M times
)
```

**Correct: LowCardinality for low unique counts**

```sql
CREATE TABLE events (
    country LowCardinality(String),      -- ~200 unique values
    browser LowCardinality(String),      -- ~50 unique values
    event_type LowCardinality(String)    -- ~100 unique values
)
```

**When to use LowCardinality:**

```sql
-- Check cardinality before deciding
SELECT uniq(column_name) FROM table_name;
```

| Unique Values | Recommendation |

|---------------|----------------|

| < 10,000 | Use LowCardinality |

| > 10,000 | Use regular String |

**LowCardinality vs FixedString:**

```sql
-- FixedString: Only for truly fixed-length data
country_code FixedString(2),    -- "US", "DE", "JP" - always 2 chars

-- LowCardinality: For variable-length low-cardinality strings
country_name LowCardinality(String),  -- "United States", "Germany"
```

Reserve `FixedString` for strictly fixed-length data (e.g., 2-char country codes). For most low-cardinality text, `LowCardinality(String)` outperforms `FixedString`.

Reference: [https://clickhouse.com/docs/best-practices/select-data-types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.14 Use Native Types Instead of String

**Impact: CRITICAL (2-10x storage reduction; enables compression and correct semantics)**

Using String for all data wastes storage, prevents compression optimization, and makes comparisons slower. ClickHouse's column-oriented architecture benefits directly from optimal type selection.

**Incorrect: String for everything**

```sql
CREATE TABLE events (
    event_id String,        -- "550e8400-e29b-41d4-a716-446655440000" = 36 bytes
    user_id String,         -- "12345" = 5 bytes (no numeric operations)
    created_at String,      -- "2024-01-15 10:30:00" = 19 bytes
    count String,           -- "42" - can't do math!
    is_active String        -- "true" = 4 bytes
)
```

**Correct: native types**

```sql
CREATE TABLE events (
    event_id UUID DEFAULT generateUUIDv4(),     -- 16 bytes (vs 36)
    user_id UInt64,                              -- 8 bytes, numeric ops
    created_at DateTime DEFAULT now(),           -- 4 bytes (vs 19)
    count UInt32 DEFAULT 0,                      -- 4 bytes, math works
    is_active Bool DEFAULT true                  -- 1 byte (vs 4)
)
```

**Type Selection Quick Reference:**

| Data | Use | Avoid |

|------|-----|-------|

| Sequential IDs | UInt32/UInt64 | String |

| UUIDs | UUID | String |

| Status/Category | Enum8 or LowCardinality(String) | String |

| Timestamps | DateTime | DateTime64, String |

| Dates only | Date or Date32 | DateTime, String |

| Counts | UInt8/16/32 (smallest that fits) | Int64, String |

| Money | Decimal(P,S) or Int64 (cents) | Float64, String |

| Booleans | Bool or UInt8 | String |

Reference: [https://clickhouse.com/docs/best-practices/select-data-types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.15 Use Partitioning for Data Lifecycle Management

**Impact: HIGH (DROP PARTITION is instant; DELETE is expensive row-by-row scan)**

Partitioning is **primarily a data management technique, not a query optimization tool**. It excels at:

- **Dropping data**: Remove entire partitions as single metadata operations

- **TTL retention**: Implement time-based retention policies efficiently

- **Tiered storage**: Move old partitions to cold storage

- **Archiving**: Move partitions between tables

**Incorrect: no time alignment for lifecycle**

```sql
-- Cannot efficiently drop old data by time
CREATE TABLE events (...)
ENGINE = MergeTree()
PARTITION BY event_type  -- No time alignment
ORDER BY (timestamp);

-- Slow: must scan and delete row by row
DELETE FROM events WHERE timestamp < '2023-01-01';
```

**Correct: time-based for lifecycle**

```sql
CREATE TABLE events (
    timestamp DateTime,
    event_type LowCardinality(String)
)
ENGINE = MergeTree()
PARTITION BY toStartOfMonth(timestamp)
ORDER BY (event_type, timestamp)
TTL timestamp + INTERVAL 1 YEAR DELETE;  -- Drops whole partitions

-- Fast: metadata-only operation
ALTER TABLE events DROP PARTITION '202301';

-- Archive to cold storage
ALTER TABLE events_archive ATTACH PARTITION '202301' FROM events;
```

If expired rows are not being removed, see [schema-ttl-verify](schema-ttl-verify.md).

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)

### 1.16 Verify TTL Deletion from Part Metadata, Not from Wall-Clock Time

**Impact: MEDIUM-HIGH (Expired rows stay on disk and visible to queries until a TTL merge rewrites or drops their part)**

A `TTL ... DELETE` rule is not a scheduled delete. Expired rows are removed only when a background merge processes their part, and until then they are still returned by queries. Four things commonly make TTL look like it "isn't deleting":

- **`merge_with_ttl_timeout`**: after a TTL delete merge in a partition, ClickHouse waits this long (14400 s, or 4 hours, by default) before it runs another one in that partition. Rows that expire in between stay until the next TTL merge.

- **`ttl_only_drop_parts = 1`**: parts are never partially pruned, only dropped once every row has expired. This works when the partition key matches the retention unit (for example a daily partition with a daily TTL). If parts span long time ranges, nothing is removed until the newest row in the part expires.

- **`ALTER ... MODIFY TTL` with `materialize_ttl_after_modify = 0`**: existing parts get no TTL info and are not picked for TTL merges. With the default (`1`), the `ALTER` queues a `MATERIALIZE TTL` mutation that rewrites the affected parts. With `materialize_ttl_recalculate_only = 1`, that mutation only recalculates TTL info, and a later TTL merge does the deletion.

- **Merge capacity**: `max_number_of_merges_with_ttl_in_pool` caps how many TTL merges run at once, so on a busy server TTL work can lag.

**Incorrect: judging TTL by the data and the clock**

```sql
-- Returns expired rows and concludes the TTL is broken
SELECT count() FROM events WHERE ts < now() - INTERVAL 30 DAY;

-- Forces a rewrite of the whole table to "fix" it
OPTIMIZE TABLE events FINAL;
```

**Correct: read each part's TTL range and the merge history**

```sql
-- Parts holding expired rows; on a table that has a TTL, a zero (1970-01-01) range means the part has no TTL info
SELECT partition, name, rows, delete_ttl_info_min, delete_ttl_info_max,
       toUnixTimestamp(delete_ttl_info_max) = 0 AS no_ttl_info
FROM system.parts
WHERE active AND database = 'db' AND table = 'events'
  AND (delete_ttl_info_min <= now() OR toUnixTimestamp(delete_ttl_info_max) = 0)
ORDER BY delete_ttl_info_min
LIMIT 50;

-- Did TTL merges run, and when?
SELECT event_time, merge_reason, part_name, rows, duration_ms
FROM system.part_log
WHERE event_date >= today() - 7
  AND database = 'db' AND table = 'events'
  AND event_type = 'MergeParts'
  AND merge_reason IN ('TTLDeleteMerge', 'TTLRecompressMerge')
ORDER BY event_time DESC
LIMIT 50;
```

Match what you see to a cause. On a table that has a TTL, parts with `no_ttl_info = 1` after a `MODIFY TTL` need `ALTER TABLE events MATERIALIZE TTL`. It is a mutation that rewrites parts, so run it only with the table owner's approval. Recent `TTLDeleteMerge` entries on parts that still have expired rows point to `merge_with_ttl_timeout`. Under `ttl_only_drop_parts`, parts whose `delete_ttl_info_max` is still in the future point to the partition layout. Check the effective settings in `system.merge_tree_settings` and any overrides in `SHOW CREATE TABLE` before you change them. On ClickHouse Cloud, read `system.part_log` through `clusterAllReplicas('default', system.part_log)`.

Reference: [https://clickhouse.com/docs/concepts/features/operations/delete/ttl](https://clickhouse.com/docs/concepts/features/operations/delete/ttl), [https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/mergetree](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/mergetree)

---

## 2. Query Optimization

**Impact: CRITICAL**

Query patterns dramatically affect performance. JOIN algorithms, filtering strategies, skipping indices, and materialized views can reduce query time from minutes to milliseconds. Pre-computed aggregations read thousands of rows instead of billions.

### 2.1 Alias Every Materialized View Output Column to Its Target Column Name

**Impact: HIGH (Unmatched names are silently dropped or filled with defaults; no error is raised)**

A materialized view with `TO target` writes its result into the target by **column name**, not by position. A target column with no same-named column in the `SELECT` gets its default value (`0`, `''`, or the column's `DEFAULT`), and a `SELECT` column with no same-named target column is discarded. Neither case raises an error, so the view looks healthy while writing wrong data.

The usual causes are unaliased expressions (`a + b` is named `plus(a, b)`) and qualified columns from a JOIN: when both sides have a `value` column, `r.value` comes out named `r.value`, which matches neither `value` nor `r_value`.

**Incorrect: relying on column order, unaliased expression and JOIN collision**

```sql
CREATE TABLE orders_enriched (
    order_id UInt64,
    amount_with_tax Decimal(18, 2),
    status String,
    customer_status String
)
ENGINE = MergeTree
ORDER BY order_id;

CREATE MATERIALIZED VIEW orders_enriched_mv TO orders_enriched AS
SELECT
    o.order_id,
    o.amount * 1.2,   -- named multiply(amount, 1.2): target column gets 0
    o.status,         -- named status: matches
    c.status          -- named c.status: discarded, customer_status gets ''
FROM orders AS o
LEFT JOIN customers AS c ON o.customer_id = c.customer_id;
```

**Correct: qualify every input and alias every output to the target name**

```sql
CREATE MATERIALIZED VIEW orders_enriched_mv TO orders_enriched AS
SELECT
    o.order_id AS order_id,
    o.amount * 1.2 AS amount_with_tax,
    o.status AS status,
    c.status AS customer_status
FROM orders AS o
LEFT JOIN customers AS c ON o.customer_id = c.customer_id;
```

**Check an existing view: compare its output names with the target's columns**

```sql
SELECT 'target column not filled by view' AS problem, name
FROM system.columns
WHERE database = 'db' AND table = 'orders_enriched'
  AND name NOT IN (SELECT name FROM system.columns WHERE database = 'db' AND table = 'orders_enriched_mv')
UNION ALL
SELECT 'view column discarded' AS problem, name
FROM system.columns
WHERE database = 'db' AND table = 'orders_enriched_mv'
  AND name NOT IN (SELECT name FROM system.columns WHERE database = 'db' AND table = 'orders_enriched');
```

Any row returned is a target column the view never fills, or a view column that is thrown away. A target column that is intentionally left to its `DEFAULT` will also appear here. After creating or changing a view, insert a small representative batch and check the target columns directly, especially columns coming from the right side of a JOIN.

Reference: [https://clickhouse.com/docs/reference/statements/create/view#materialized-view](https://clickhouse.com/docs/reference/statements/create/view#materialized-view), [https://clickhouse.com/docs/concepts/features/materialized-views/incremental-materialized-view](https://clickhouse.com/docs/concepts/features/materialized-views/incremental-materialized-view)

### 2.2 Choose an Aggregating Target Engine for GROUP BY Materialized Views

**Impact: CRITICAL (A ReplacingMergeTree target silently discards partial aggregates; a plain MergeTree target returns one partial row per insert block)**

An incremental materialized view runs its `SELECT` on each inserted block, not on the whole source table, so `GROUP BY` produces one partial row per key **per block**. Separate INSERTs are separate blocks, and one large INSERT can also be split into several blocks. Nothing combines those partial rows unless the target engine does:

| Target engine | What happens to partial rows for one key |

|---|---|

| `MergeTree` | All kept. Correct only if every query re-aggregates. |

| `ReplacingMergeTree` | Merges keep one partial row and **discard the rest**. The data is lost, and re-aggregating afterwards cannot recover it. |

| `SummingMergeTree` | Numeric columns are summed at merge time. Correct for additive values, if queries still re-aggregate. |

| `AggregatingMergeTree` | Aggregate states are combined. Correct for any aggregate with `-State` / `-Merge`. |

**Incorrect: ReplacingMergeTree target for a GROUP BY view**

```sql
CREATE TABLE user_totals (user_id UInt64, total UInt64, orders UInt64)
ENGINE = ReplacingMergeTree
ORDER BY user_id;

CREATE MATERIALIZED VIEW user_totals_mv TO user_totals AS
SELECT user_id, sum(amount) AS total, count() AS orders
FROM orders
GROUP BY user_id;

-- Three INSERTs for user 1 with amounts 10, 5 and 7 write three partial rows.
-- After a merge (or with FINAL) only the last one survives: total = 7, not 22.
SELECT user_id, total FROM user_totals FINAL WHERE user_id = 1;
```

Before merges run, `sum(total)` over this table still looks right, so the loss often appears later.

**Correct: SummingMergeTree for additive values, re-aggregated at query time**

```sql
CREATE TABLE user_totals (user_id UInt64, total UInt64, orders UInt64)
ENGINE = SummingMergeTree
ORDER BY user_id;

CREATE MATERIALIZED VIEW user_totals_mv TO user_totals AS
SELECT user_id, sum(amount) AS total, count() AS orders
FROM orders
GROUP BY user_id;

-- Rows not yet merged are still partial, so aggregate again.
SELECT user_id, sum(total) AS total, sum(orders) AS orders
FROM user_totals
WHERE user_id = 1
GROUP BY user_id;
```

`SummingMergeTree` sums every numeric column outside the sorting key unless you list the columns to sum, and rows whose summed columns are all zero can disappear during merges.

**Correct: AggregatingMergeTree for non-additive aggregates**

```sql
CREATE TABLE user_stats (
    user_id UInt64,
    total SimpleAggregateFunction(sum, UInt64),
    max_amount SimpleAggregateFunction(max, UInt64),
    buyers AggregateFunction(uniq, UInt64)
)
ENGINE = AggregatingMergeTree
ORDER BY user_id;

CREATE MATERIALIZED VIEW user_stats_mv TO user_stats AS
SELECT user_id, sum(amount) AS total, max(amount) AS max_amount, uniqState(buyer_id) AS buyers
FROM orders
GROUP BY user_id;

SELECT user_id, sum(total) AS total, max(max_amount) AS max_amount, uniqMerge(buyers) AS buyers
FROM user_stats
GROUP BY user_id;
```

`SimpleAggregateFunction` columns take the plain function in the view and in the query; `AggregateFunction` columns take `-State` in the view and `-Merge` in the query. Keep the view's `GROUP BY` consistent with the target's `ORDER BY`, because that key is what merges combine on. To check an existing view, compare a source aggregate with the target's re-aggregated value for a sample of keys over a closed time window.

Reference: [https://clickhouse.com/docs/concepts/features/materialized-views/incremental-materialized-view](https://clickhouse.com/docs/concepts/features/materialized-views/incremental-materialized-view), [https://clickhouse.com/docs/reference/statements/create/view#materialized-view](https://clickhouse.com/docs/reference/statements/create/view#materialized-view), [https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/summingmergetree](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/summingmergetree), [https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/aggregatingmergetree](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/aggregatingmergetree)

### 2.3 Choose the Right JOIN Algorithm

**Impact: CRITICAL (Wrong algorithm causes OOM; right algorithm handles large tables efficiently)**

ClickHouse's default hash join loads the RIGHT table entirely into memory. Choose the right algorithm based on table sizes and constraints.

**Algorithm selection:**

| Algorithm | Best For | Trade-off |

|-----------|----------|-----------|

| `parallel_hash` | Small-to-medium in-memory tables | Default since 24.11; fast, concurrent |

| `hash` | General purpose, all join types | Single-threaded hash table build |

| `direct` | Dictionary lookups (INNER/LEFT only) | Fastest; no hash table construction |

| `full_sorting_merge` | Tables already sorted on join key | Skips sort if pre-ordered; low memory |

| `partial_merge` | Large tables, memory-constrained | Minimized memory; slower execution |

| `grace_hash` | Large datasets, tunable memory | Flexible; disk-spilling capability |

| `auto` | Adaptive algorithm selection | Tries hash first, falls back on memory pressure |

**Example usage:**

```sql
-- Let ClickHouse choose automatically
SET join_algorithm = 'auto';

-- For large-to-large joins where memory is constrained
SET join_algorithm = 'partial_merge';
SELECT * FROM large_a JOIN large_b ON large_b.id = large_a.id;

-- When joining by primary key columns, sort-merge skips sorting step
SET join_algorithm = 'full_sorting_merge';
SELECT * FROM table_a a JOIN table_b b ON b.pk_col = a.pk_col;
```

**Note:** ClickHouse 24.12+ automatically positions smaller tables on the right side. For earlier versions, manually ensure the smaller table is on the RIGHT.

Reference: [https://clickhouse.com/docs/best-practices/minimize-optimize-joins](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.4 Compare Individual Executions When a Query Gets Slower

**Impact: MEDIUM (Averages mix data growth, cold caches and contention; single executions separate them)**

When a query that used to be fast gets slower, list its individual executions and compare them. Group them by `normalized_query_hash`, which is the same for queries that differ only in literal values. An hourly average of duration looks the same whether the table grew, a cache was cold, or other queries were competing for CPU. The rows read and the ProfileEvents of each execution tell these cases apart.

**Incorrect: averaging hides which executions were slow and why**

```sql
SELECT toStartOfHour(event_time) AS hour, avg(query_duration_ms) AS avg_ms
FROM system.query_log
WHERE event_date >= today() - 1 AND type = 'QueryFinish'
GROUP BY hour
ORDER BY hour;
```

**Correct: one row per execution of one query shape**

```sql
-- 1. Query shapes that use the most total time
SELECT normalized_query_hash, count() AS runs,
       quantiles(0.5, 0.95)(query_duration_ms) AS p50_p95_ms,
       any(substring(normalizeQuery(query), 1, 100)) AS sample
FROM clusterAllReplicas('default', system.query_log)
WHERE event_date >= today() - 1 AND type = 'QueryFinish' AND query_kind = 'Select'
GROUP BY normalized_query_hash
ORDER BY sum(query_duration_ms) DESC
LIMIT 10;

-- 2. Each execution of one shape (put the hash from step 1 here)
SELECT event_time, hostname, query_duration_ms, read_rows,
       ProfileEvents['SelectedMarks'] AS marks,
       ProfileEvents['MarkCacheMisses'] AS mark_cache_misses,
       formatReadableSize(ProfileEvents['CachedReadBufferReadFromSourceBytes']) AS fs_cache_miss,
       formatReadableSize(ProfileEvents['CachedReadBufferReadFromCacheBytes']) AS fs_cache_hit,
       formatReadableSize(ProfileEvents['OSReadBytes']) AS disk_read,
       round(ProfileEvents['OSCPUWaitMicroseconds'] / 1e6, 2) AS cpu_wait_s
FROM clusterAllReplicas('default', system.query_log)
WHERE event_date >= today() - 1
  AND type = 'QueryFinish'
  AND normalized_query_hash = 1448941773548997605
ORDER BY event_time DESC
LIMIT 50;

-- 3. Concurrency on that host around one slow execution
WITH toDateTime('2026-09-29 15:13:18') AS slow_run_end
SELECT hostname, max(CurrentMetric_Query) AS concurrent_queries,
       sum(ProfileEvent_SelectedRows) AS rows_read_by_all_queries
FROM clusterAllReplicas('default', system.metric_log)
WHERE event_date >= toDate(slow_run_end) - 1
  AND event_time BETWEEN slow_run_end - INTERVAL 10 SECOND AND slow_run_end
GROUP BY hostname
LIMIT 10;
```

**Reading the slow executions against the fast ones:**

| Slow executions show | Likely cause | Next step |

|----------------------|--------------|-----------|

| More `read_rows` and `marks` | More data read: the table grew, the filter matched more, or pruning was lost | Compare `SelectedMarks` with `SelectedMarksTotal`; see [query-index-verify-usage](query-index-verify-usage.md) |

| Same rows, more `fs_cache_miss`, `disk_read` or `mark_cache_misses` | Cold caches | Check whether the slow runs cluster on one `hostname`; caches are per replica |

| Same rows, same cache profile, higher `cpu_wait_s` or `concurrent_queries` | Contention with other work | Find the concurrent queries, merges or inserts on that host |

In a local reproduction with one query shape, concurrent heavy queries made it several times slower with rows and marks unchanged, while adding matching rows raised `read_rows` and the duration together.

**Notes:**

- The queries read every replica through `clusterAllReplicas('default', ...)`, as needed on ClickHouse Cloud. On self-managed servers, use your cluster name or the local table.

- `normalized_query_hash` replaces literal values with placeholders, and IN lists of two or more values with one placeholder. `IN (1, 2, 3)` and `IN (5, 6)` get the same hash. `IN (1)`, `= 8` and `IN (9, 10)` each get a different one, as do queries with different SETTINGS names.

- On ClickHouse Cloud the filesystem cache differs from replica to replica, depending on each replica's activity. `CachedReadBuffer*` events cover reads through that cache. `OSReadBytes` and `OSCPUWaitMicroseconds` come from the operating system and are 0 where the OS does not report them.

- Cache-miss and CPU-wait values are evidence that fits a cause. They do not prove it. Look for the same pattern across several slow executions before you act.

Reference: [https://clickhouse.com/docs/reference/system-tables/query_log](https://clickhouse.com/docs/reference/system-tables/query_log), [https://clickhouse.com/docs/reference/system-tables/events](https://clickhouse.com/docs/reference/system-tables/events), [https://clickhouse.com/docs/products/cloud/features/monitoring/cloud-console](https://clickhouse.com/docs/products/cloud/features/monitoring/cloud-console), [https://clickhouse.com/docs/products/cloud/features/infrastructure/parallel-replicas](https://clickhouse.com/docs/products/cloud/features/infrastructure/parallel-replicas)

### 2.5 Consider Alternatives to JOINs

**Impact: CRITICAL (Dictionaries and denormalization shift work from query time to insert time)**

Repeated JOINs to dimension tables add overhead. Dictionaries or denormalization shift computational work from query time to insert/pre-processing time.

**Incorrect: JOIN on every query**

```sql
-- JOIN on every query
SELECT o.order_id, c.name, c.email
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at > '2024-01-01';
```

**Correct - Dictionary Lookup:**

```sql
-- Create dictionary
CREATE DICTIONARY customer_dict (
    id UInt64,
    name String,
    email String
)
PRIMARY KEY id
SOURCE(CLICKHOUSE(TABLE 'customers'))
LAYOUT(HASHED())
LIFETIME(MIN 300 MAX 360);

-- Use dictGet instead of JOIN (uses direct join algorithm - fastest)
SELECT
    order_id,
    dictGet('customer_dict', 'name', customer_id) as customer_name,
    dictGet('customer_dict', 'email', customer_id) as customer_email
FROM orders
WHERE created_at > '2024-01-01';
```

**Correct - Denormalization:**

```sql
-- Denormalized table with materialized view
CREATE MATERIALIZED VIEW orders_enriched_mv TO orders_enriched AS
SELECT
    o.order_id, o.customer_id,
    c.name as customer_name,
    c.email as customer_email,
    o.total, o.created_at
FROM orders o
JOIN customers c ON c.id = o.customer_id;
```

**Approach comparison:**

| Approach | Use Case | Performance |

|----------|----------|-------------|

| Dictionary | Frequent lookups to small dimension | Fastest (in-memory) |

| Denormalization | Analytics always need enriched data | Fast (no join at query) |

| IN subquery | Existence filtering | Often faster than JOIN |

| JOIN | Infrequent or complex joins | Acceptable |

**Critical dictionary caveat:** Dictionaries silently deduplicate duplicate keys, retaining only the final value. Only use when source has unique keys.

Reference: [https://clickhouse.com/docs/best-practices/minimize-optimize-joins](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.6 Diagnose MEMORY_LIMIT_EXCEEDED Before Raising Limits

**Impact: HIGH (Error 241 has at least three causes; raising max_memory_usage addresses only one of them)**

`MEMORY_LIMIT_EXCEEDED` (code 241) means that one memory tracker reached its limit. The tracker can belong to the query, to the user, or to the whole server. The message names it. Before 24.11 the wording is `Memory limit (for query)`, `(for user)` or `(total)`. From 24.11 it is `Query memory limit exceeded`, `User memory limit exceeded` or `(total) memory limit exceeded` (the server-level message also reports current RSS). If the message contains `OvercommitTracker decision`, the user or the server was under memory pressure and the overcommit tracker intervened; `Query was selected to stop by OvercommitTracker` means it picked this query to free memory. The query that failed may not be the one using the most memory.

**Incorrect: treating the failed query's memory_usage as its demand**

```sql
-- memory_usage of a failed query stops near the limit that stopped it.
-- The same query without a limit can need many times more.
SELECT memory_usage FROM system.query_log
WHERE event_date = today() AND exception_code = 241
LIMIT 1;
-- ...then raising max_memory_usage for everyone.
```

**Correct: find which tracker failed, then compare with what else was running**

```sql
-- 1. The failures, with the tracker named in the message
SELECT event_time, hostname, query_id, user, normalized_query_hash,
       formatReadableSize(memory_usage) AS mem_at_failure,
       substring(exception, 1, 160) AS error
FROM clusterAllReplicas('default', system.query_log)
WHERE event_date >= today() - 1
  AND type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')
  AND exception_code = 241
ORDER BY event_time DESC
LIMIT 20;

-- 2. Queries running at the failure time t, largest first
WITH toDateTime('2026-09-29 15:10:04') AS t
SELECT hostname, query_id, user, type, formatReadableSize(memory_usage) AS peak_mem,
       query_start_time, query_duration_ms, substring(query, 1, 80) AS q
FROM clusterAllReplicas('default', system.query_log)
WHERE event_date >= toDate(t) - 1
  AND event_time BETWEEN t AND t + INTERVAL 1 HOUR
  AND query_start_time <= t
  AND type != 'QueryStart'
ORDER BY memory_usage DESC
LIMIT 10;

-- 3. Server-level tracked memory and concurrency around t
WITH toDateTime('2026-09-29 15:10:04') AS t
SELECT hostname, toStartOfMinute(event_time) AS minute,
       formatReadableSize(max(CurrentMetric_MemoryTracking)) AS tracked_peak,
       formatReadableSize(max(CurrentMetric_MergesMutationsMemoryTracking)) AS merges_peak,
       max(CurrentMetric_Query) AS queries_peak
FROM clusterAllReplicas('default', system.metric_log)
WHERE event_date >= toDate(t) - 1
  AND event_time BETWEEN t - INTERVAL 30 MINUTE AND t + INTERVAL 5 MINUTE
GROUP BY hostname, minute
ORDER BY hostname, minute
LIMIT 100;

-- 4. Process RSS compared with what the allocator holds (trend over days, not one sample)
SELECT hostname, toStartOfHour(event_time) AS hour,
       formatReadableSize(maxIf(value, metric = 'MemoryResident')) AS rss,
       formatReadableSize(maxIf(value, metric = 'jemalloc.resident')) AS allocator_resident,
       formatReadableSize(maxIf(value, metric = 'jemalloc.allocated')) AS allocated
FROM clusterAllReplicas('default', system.asynchronous_metric_log)
WHERE event_date >= today() - 7
  AND metric IN ('MemoryResident', 'jemalloc.resident', 'jemalloc.allocated')
GROUP BY hostname, hour
ORDER BY hostname, hour
LIMIT 1000;
```

The queries read every replica, as needed on ClickHouse Cloud; on self-managed servers use your cluster name or the local tables. `system.asynchronous_metric_log` exists only when the server config enables it, and `MemoryResident` is reported on Linux and FreeBSD only.

**Reading the evidence:**

| Evidence | Likely cause | Direction |

|----------|--------------|-----------|

| Query-level message; the peers are small; the same `normalized_query_hash` fails repeatedly | One heavy query | Change the query shape (below); compare its executions as in [query-perf-compare-executions](query-perf-compare-executions.md) |

| User or total message, or an `OvercommitTracker decision`; several large peers; `tracked_peak` near the server limit | Total demand from concurrent queries and merges | Reduce or spread out concurrency; set per-user limits |

| RSS well above `allocated`, with per-query memory flat while traffic grew | Memory the allocator keeps after earlier peaks | Not a single-query problem. `SYSTEM JEMALLOC PURGE` returned retained pages locally but left `jemalloc.allocated` unchanged, so it is not a fix |

**Fixes for one heavy query:**

- **Spill to disk.** Set `max_bytes_before_external_group_by` or `max_bytes_before_external_sort`. The docs advise setting `max_memory_usage` about twice as high, because merging the spilled data needs memory too. `max_bytes_ratio_before_external_group_by` (24.12 and later; default 0.5 from 25.1) is a fraction of the memory left to the user and the server, not of `max_memory_usage`. When the per-query limit is far below server memory, the ratio does not trigger. Locally, a query under a per-query limit failed without spilling, and succeeded once an explicit threshold of about half the limit was set. `ProfileEvents['ExternalAggregationWritePart']` and `['ExternalSortWritePart']` in `query_log` show whether a spill happened.

- **Approximate distinct counts.** `count(DISTINCT x)` runs as `uniqExact` by default (`count_distinct_implementation`). Where an approximate count is acceptable, `uniq` used markedly less memory than `uniqExact` for the same GROUP BY locally.

- **Aggregate in key order.** When GROUP BY starts with the table's sort-key prefix, `optimize_aggregation_in_order = 1` cut peak memory several-fold locally. It was slightly slower.

- **JOINs.** The right-hand side is usually built in memory. See [query-join-choose-algorithm](query-join-choose-algorithm.md), [query-join-filter-before](query-join-filter-before.md) and [query-join-consider-alternatives](query-join-consider-alternatives.md).

- **Limits.** `max_memory_usage` is per query. The server-wide ceiling (`max_server_memory_usage`) is separate. A per-query limit above what the server can supply turns a query-level failure into a `(total)` failure. At that point the overcommit tracker can stop whichever query has the largest overcommit ratio, and that may be a different query.

Reference: [https://clickhouse.com/docs/reference/statements/select/group-by#group-by-in-external-memory](https://clickhouse.com/docs/reference/statements/select/group-by#group-by-in-external-memory), [https://clickhouse.com/docs/concepts/features/configuration/settings/memory-overcommit](https://clickhouse.com/docs/concepts/features/configuration/settings/memory-overcommit), [https://clickhouse.com/docs/reference/system-tables/asynchronous_metrics](https://clickhouse.com/docs/reference/system-tables/asynchronous_metrics)

### 2.7 Diagnose Slow or Failing Inserts Through Their Materialized Views

**Impact: HIGH (Every incremental view runs inside the INSERT; one slow or failing view delays or fails the whole insert)**

Incremental materialized views run synchronously as part of the `INSERT` into their source table. The client gets its acknowledgement only after every attached view (and every view chained after them) has processed the block. So insert latency includes the slowest view's work, and a view that throws makes the `INSERT` fail.

A failed `INSERT` is not rolled back. Blocks already written to the source table and to other views stay written, and later blocks are not written. A client that retries the whole batch can therefore duplicate rows in the source and in views that succeeded, unless insert deduplication covers the retry.

`system.query_views_log` records each view's run within an insert: duration, rows read and written, memory, status and exception. It depends on the `log_query_views` setting and the server's `query_views_log` configuration, so first check that the table has recent rows.

**Incorrect: reading only the insert's own log entry**

```sql
-- Shows that the INSERT was slow or failed, but not which view caused it.
SELECT event_time, query_duration_ms, exception
FROM system.query_log
WHERE event_date >= today() - 1
  AND query_kind = 'Insert'
  AND type != 'QueryStart'
ORDER BY query_duration_ms DESC
LIMIT 20;
```

**Correct: break each slow or failed insert down per view**

```sql
-- On ClickHouse Cloud both logs are per replica, so read them across replicas.
SELECT
    q.event_time,
    q.query_duration_ms,
    q.type AS insert_status,
    v.view_name,
    v.view_duration_ms,
    v.read_rows,
    v.written_rows,
    formatReadableSize(v.peak_memory_usage) AS view_memory,
    v.status AS view_status,
    substring(v.exception, 1, 200) AS view_exception
FROM clusterAllReplicas('default', system.query_log) AS q
INNER JOIN
(
    SELECT initial_query_id, view_name, view_duration_ms, read_rows, written_rows,
           peak_memory_usage, status, exception
    FROM clusterAllReplicas('default', system.query_views_log)
    WHERE event_date >= today() - 1
) AS v ON v.initial_query_id = q.query_id
WHERE q.event_date >= today() - 1
  AND q.event_time >= now() - INTERVAL 6 HOUR
  AND q.query_kind = 'Insert'
  AND q.type IN ('QueryFinish', 'ExceptionWhileProcessing')
  AND (q.query_duration_ms > 1000 OR q.type = 'ExceptionWhileProcessing'
       OR v.status != 'QueryFinish')
ORDER BY q.event_time DESC, v.view_duration_ms DESC
LIMIT 100;
```

The `v.status` condition also catches view failures that `materialized_views_ignore_errors = 1` hid from the client, where the insert itself reports `QueryFinish`. On a self-managed single server, drop `clusterAllReplicas` and read the local tables. Adjust the time window and the duration filter to your workload. A view with `read_rows` far above the insert's own row count usually reads another table on every block, typically the right-hand side of a JOIN (see [query-mv-chained-and-joins](query-mv-chained-and-joins.md)).

**Reducing the cost:**

- Fix the view the log points to first: simplify its query, replace a JOIN on a large table with a dictionary, or move heavy work to a refreshable view (see [query-mv-refreshable](query-mv-refreshable.md)).

- `parallel_view_processing = 1` runs the views attached to one table concurrently instead of one after another (the default is `0`). It can cut wall-clock insert time when several views are attached, at the cost of more concurrent CPU and memory, and it does not help when one view dominates. Measure both settings on representative inserts.

- `materialized_views_ignore_errors = 1` makes the `INSERT` succeed when a view fails, but the failing view's target silently misses those rows. Use it only when that divergence is acceptable and you will backfill.

Reference: [https://clickhouse.com/docs/reference/system-tables/query_views_log](https://clickhouse.com/docs/reference/system-tables/query_views_log), [https://clickhouse.com/docs/reference/statements/create/view#materialized-view](https://clickhouse.com/docs/reference/statements/create/view#materialized-view), [https://clickhouse.com/docs/concepts/features/materialized-views/incremental-materialized-view#materialized-views-parallel-vs-sequential](https://clickhouse.com/docs/concepts/features/materialized-views/incremental-materialized-view#materialized-views-parallel-vs-sequential)

### 2.8 Filter Tables Before Joining

**Impact: CRITICAL (Joining full tables then filtering wastes resources)**

Joining full tables then filtering wastes resources. Add filtering in `WHERE` or `JOIN ON` clauses. If automatic pushdown fails, restructure as a subquery.

**Incorrect: join then filter**

```sql
-- Joins entire tables, then filters
SELECT o.order_id, c.name, o.total
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at > '2024-01-01' AND c.country = 'US';
```

**Correct: filter in subqueries before joining**

```sql
-- Filter in subqueries before joining
SELECT o.order_id, c.name, o.total
FROM (
    SELECT order_id, customer_id, total
    FROM orders
    WHERE created_at > '2024-01-01'
) o
JOIN (
    SELECT id, name
    FROM customers
    WHERE country = 'US'
) c ON c.id = o.customer_id;
```

**Even better - aggregate before joining:**

```sql
SELECT c.country, o.total_revenue
FROM (
    SELECT customer_id, sum(total) as total_revenue
    FROM orders
    WHERE created_at > '2024-01-01'
    GROUP BY customer_id
) o
JOIN customers c ON c.id = o.customer_id;
```

Reference: [https://clickhouse.com/docs/best-practices/minimize-optimize-joins](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.9 Keep ReplacingMergeTree Versions of a Key in One Partition

**Impact: HIGH (Rows with the same key in different partitions are never deduplicated on disk; FINAL results depend on a setting)**

`ReplacingMergeTree` removes duplicates only when parts merge, and parts merge only within a partition. Two rows with the same `ORDER BY` key in different partitions stay on disk as two rows: background merges never combine them, and `OPTIMIZE TABLE ... FINAL` does not either. This happens whenever the partition key is computed from a column that changes between versions, such as partitioning by the month of `updated_at`.

`SELECT ... FINAL` still returns one row per key by default, because it merges across partitions at query time. With `do_not_merge_across_partitions_select_final = 1`, a setting often enabled to speed up `FINAL`, each partition is processed independently and both rows come back. `GROUP BY` + `argMax` reads are not affected by partitioning.

**Incorrect: partition key follows a column that changes on update**

```sql
CREATE TABLE orders
(
    order_id UInt64,
    status LowCardinality(String),
    created_at DateTime,
    updated_at DateTime,
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(updated_at)
ORDER BY order_id;

-- An order created on 31 August and shipped on 1 September has one
-- row in each monthly partition. Both rows survive every merge.
SELECT order_id, status
FROM orders FINAL
WHERE order_id = 42
SETTINGS do_not_merge_across_partitions_select_final = 1;
-- Returns 2 rows.
```

**Correct: partition by a value that never changes for a key**

```sql
CREATE TABLE orders
(
    order_id UInt64,
    status LowCardinality(String),
    created_at DateTime,
    updated_at DateTime,
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(created_at)
ORDER BY order_id;
```

Every version of an order now lands in the partition of its creation month, so merges and `FINAL` (with either setting) can collapse it. Many `ReplacingMergeTree` tables need no partitioning at all (see [schema-partition-start-without](schema-partition-start-without.md)).

**Check an existing table for keys split across partitions:**

```sql
SELECT order_id, uniqExact(_partition_id) AS partitions
FROM orders
WHERE created_at >= now() - INTERVAL 7 DAY
GROUP BY order_id
HAVING partitions > 1
LIMIT 20;
```

**Version semantics:** the highest `version` wins regardless of insert order; with equal or no versions, the last inserted row wins. With `ReplacingMergeTree(version, is_deleted)` a delete row is kept by default so a lower-version insert cannot resurrect the key. `OPTIMIZE ... FINAL` cannot fix keys split across partitions (see [insert-optimize-avoid-final](insert-optimize-avoid-final.md)).

Reference: [https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/replacingmergetree](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/replacingmergetree), [https://clickhouse.com/docs/concepts/features/operations/update/replacing-merge-tree#exploiting-partitions-with-replacingmergetree](https://clickhouse.com/docs/concepts/features/operations/update/replacing-merge-tree#exploiting-partitions-with-replacingmergetree)

### 2.10 Materialized Views Read the Inserted Block, Not the Table

**Impact: HIGH (Chained views see unmerged rows; JOIN views miss right-table changes and re-read the right table on every insert)**

An incremental materialized view is an insert trigger. Its `FROM` table stands for the block being inserted right now, not for the table's contents. Two consequences are easy to miss:

- **Chained views.** In `source → mv1 → mid → mv2 → final`, `mv2` fires on the rows `mv1` writes into `mid`. It never sees `mid` after merges, so if `mid` is a `ReplacingMergeTree`, `SummingMergeTree` or `CollapsingMergeTree`, `mv2` receives every version, every partial sum and every cancel row.

- **Views with a JOIN.** Only inserts into the left-most table trigger the view. The right-hand table is read in full on every insert block, and inserts or updates to it do not trigger the view or change rows it already wrote.

**Incorrect: expecting a chained view to see deduplicated rows**

```sql
-- orders_latest is a ReplacingMergeTree fed by another view.
-- This view fires on every version written to orders_latest,
-- so an order updated three times is counted three times.
CREATE MATERIALIZED VIEW orders_per_day_mv TO orders_per_day AS
SELECT toDate(created_at) AS day, count() AS orders
FROM orders_latest
GROUP BY day;
```

**Correct: keep aggregate states through the chain, or resolve versions at query time**

```sql
-- Carry states that combine correctly regardless of merge timing,
-- e.g. uniqState over the order id instead of count() over versions.
CREATE MATERIALIZED VIEW orders_per_day_mv TO orders_per_day AS
SELECT toDate(created_at) AS day, uniqExactState(order_id) AS orders
FROM orders_latest
GROUP BY day;

SELECT day, uniqExactMerge(orders) AS orders
FROM orders_per_day
GROUP BY day;
```

This works because every version of an order carries the same `order_id` and `created_at`. If the grouping columns can change between versions, or the downstream result needs the latest value of a column, no incremental view can resolve that from blocks alone. Query the upstream table with `FINAL` or `argMax`, or use a refreshable view (see [query-mv-refreshable](query-mv-refreshable.md)).

**Incorrect: enrichment JOIN on a large or changing dimension**

```sql
-- Fires on inserts into events only. Each insert block reads all of
-- users; a user inserted after their events leaves those rows with
-- default values (empty string) for good.
CREATE MATERIALIZED VIEW events_enriched_mv TO events_enriched AS
SELECT e.event_id AS event_id, e.user_id AS user_id, u.country AS country
FROM events AS e
LEFT JOIN users AS u ON e.user_id = u.user_id;
```

**Correct: dictionary lookup, or refreshable view when the dimension changes**

```sql
-- A dictionary is held in memory and refreshed on its own schedule,
-- so the insert path does not scan the users table.
CREATE MATERIALIZED VIEW events_enriched_mv TO events_enriched AS
SELECT
    event_id,
    user_id,
    dictGet('users_dict', 'country', user_id) AS country
FROM events;
```

The dictionary lookup is still evaluated once, at insert time. If rows must reflect later changes to the dimension, join at query time or rebuild the result with a refreshable view. A JOIN inside an incremental view is reasonable when the right-hand table is small and effectively static; check its cost with `read_rows` per view in `system.query_views_log` (see [query-mv-insert-cost](query-mv-insert-cost.md)).

Reference: [https://clickhouse.com/docs/concepts/features/materialized-views/incremental-materialized-view#materialized-views-and-joins](https://clickhouse.com/docs/concepts/features/materialized-views/incremental-materialized-view#materialized-views-and-joins), [https://clickhouse.com/docs/concepts/features/materialized-views/cascading-materialized-views](https://clickhouse.com/docs/concepts/features/materialized-views/cascading-materialized-views), [https://clickhouse.com/docs/reference/statements/create/view#materialized-view](https://clickhouse.com/docs/reference/statements/create/view#materialized-view)

### 2.11 Optimize NULL Handling in Outer JOINs

**Impact: MEDIUM (Default values instead of NULL reduces memory overhead)**

Set `join_use_nulls = 0` to use default column values instead of NULL markers, reducing memory overhead compared to Nullable wrappers.

**Example:**

```sql
-- Use default values instead of NULLs for non-matching rows
SET join_use_nulls = 0;

SELECT o.order_id, c.name
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id;
-- Non-matching rows get '' for name instead of NULL
```

**When to use:**

| Setting | Behavior | Use Case |

|---------|----------|----------|

| `join_use_nulls = 0` (default) | Default values (empty string, 0) for non-matches | When you can handle default values |

| `join_use_nulls = 1` | NULL for non-matches | When you need to distinguish "no match" from "matched with default" |

Reference: [https://clickhouse.com/docs/best-practices/minimize-optimize-joins](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.12 Query ClickPipes Postgres CDC Tables as Versioned Rows

**Impact: HIGH (Plain reads of CDC destination tables return every change, not the current Postgres state: counts, sums, and joins come out wrong)**

ClickPipes replicates each Postgres INSERT, UPDATE and DELETE as a new inserted row in a `ReplacingMergeTree` table. It adds three columns:

| Column | Type | Meaning |

|--------|------|---------|

| `_peerdb_version` | `Int64` | Version of the row; the engine's version column |

| `_peerdb_is_deleted` | `Int8` | `1` if this version is a Postgres DELETE |

| `_peerdb_synced_at` | `DateTime64(9) DEFAULT now64()` | When the version was written to ClickHouse |

The generated DDL is `ENGINE = ReplacingMergeTree(_peerdb_version)` with `ORDER BY` set to the Postgres primary key. `_peerdb_is_deleted` is an ordinary column, not the engine's `is_deleted` parameter, so `FINAL` keeps delete markers: test the flag on the deduplicated row (after `FINAL`, or in `HAVING` for `argMax` reads), never before deduplication. This rule covers what is specific to ClickPipes tables. Confirm the names with `SHOW CREATE TABLE`, because a table you created yourself may differ.

**Incorrect: plain reads count every version**

```sql
-- Order 1 was inserted, then updated; order 2 was inserted, then deleted.
-- This counts three rows for one live order: both versions of order 1,
-- plus order 2 through its pre-delete version.
SELECT status, count() AS orders, sum(amount) AS revenue
FROM orders
WHERE _peerdb_is_deleted = 0
GROUP BY status;
```

**Correct: FINAL, then drop delete markers; FINAL on every CDC table in a join**

```sql
SELECT status, count() AS orders, sum(amount) AS revenue
FROM orders FINAL
WHERE _peerdb_is_deleted = 0
GROUP BY status;

-- Joins: both sides are CDC tables, so both need deduplication.
-- SETTINGS final = 1 applies FINAL to every table in the query.
SELECT c.name, count() AS orders, sum(o.amount) AS revenue
FROM orders AS o
INNER JOIN customers AS c ON c.id = o.customer_id
WHERE o._peerdb_is_deleted = 0 AND c._peerdb_is_deleted = 0
GROUP BY c.name
SETTINGS final = 1;
```

To check that the pipe is in sync, compare Postgres `SELECT count(*)` with `SELECT count() FROM orders FINAL WHERE _peerdb_is_deleted = 0`, taken over the same window. To see when data last landed, `SELECT max(_peerdb_synced_at) FROM orders` gives the time the latest version was written to ClickHouse. It does not tell you how far the source has moved on since.

**Filter placement:**

- Put the delete filter in `WHERE`, not `PREWHERE`. On 25.3, an explicit `PREWHERE _peerdb_is_deleted = 0` on a `FINAL` query ran before deduplication, so a deleted row came back with its old values. Newer versions add `apply_prewhere_after_final` (default `0`).

- A row policy of the form `USING _peerdb_is_deleted = 0` (the deduplication docs suggest one) is only correct if it is applied after `FINAL`. Some recent versions applied such policies before `FINAL`. The `apply_row_policy_after_final` setting restores the after-`FINAL` behavior. It is on by default from 26.2 (and in later patch releases of some earlier versions); older versions may lack it or default it to `0`. Check `SELECT getSetting('apply_row_policy_after_final')` on your service before relying on a row policy for delete filtering.

**What the rows contain:**

- **Deletes.** By default Postgres sends only primary-key (replica identity) values for a DELETE, so the delete version has empty or default values in the other columns. Unfiltered queries show blank rows, and a non-key filter applied before deduplication can skip the delete version and resurrect the row.

- **TOAST columns.** Without `REPLICA IDENTITY FULL` on the Postgres table, a large (TOASTed) column that an UPDATE did not change arrives as NULL or empty, and so does every TOAST column on a DELETE. The fix is on the Postgres side (`ALTER TABLE ... REPLICA IDENTITY FULL`), and it increases WAL volume.

- **Primary-key updates.** Updating a Postgres primary key arrives as a row with a new key. The version under the old key is not superseded, so it stays live.

**ORDER BY is the deduplication key:**

- ClickPipes uses the Postgres primary key as `ORDER BY`. If you add columns to a custom ordering key, use only columns that never change for a row, and keep the primary key in the key. With a mutable column such as `status` in `ORDER BY`, each status change creates a separate key, so `FINAL` returns one row per status the order ever had.

- For a custom ordering key, the ClickPipes docs also require the Postgres `REPLICA IDENTITY` to include the ordering-key columns. Otherwise, deletes may not deduplicate against earlier versions.

- For analytical ordering that needs mutable columns, build a downstream table or a refreshable materialized view from the deduplicated data (`FINAL ... WHERE _peerdb_is_deleted = 0`).

**Materialized views see every version.** An incremental materialized view on a CDC table processes each inserted block, including updates and deletes. A view that sums `amount` counts updates again and never subtracts deletes (in a local test: 200 against a true total of 0 after insert, update and delete). Use a refreshable materialized view over the `FINAL` read, or version-aware aggregation.

Postgres-side troubleshooting (replication slots, WAL retention, publications) is outside this rule. Use the ClickPipes console and the Postgres docs for that.

Reference: [https://clickhouse.com/docs/integrations/clickpipes/postgres/deduplication](https://clickhouse.com/docs/integrations/clickpipes/postgres/deduplication), [https://clickhouse.com/docs/integrations/clickpipes/postgres/ordering_keys](https://clickhouse.com/docs/integrations/clickpipes/postgres/ordering_keys), [https://clickhouse.com/docs/integrations/clickpipes/postgres/toast](https://clickhouse.com/docs/integrations/clickpipes/postgres/toast), [https://clickhouse.com/docs/integrations/clickpipes/postgres/faq](https://clickhouse.com/docs/integrations/clickpipes/postgres/faq), [https://clickhouse.com/docs/reference/settings/session-settings/apply](https://clickhouse.com/docs/reference/settings/session-settings/apply), [https://clickhouse.com/docs/reference/settings/session-settings/other#final](https://clickhouse.com/docs/reference/settings/session-settings/other#final)

### 2.13 Use ANY JOIN When Only One Match Needed

**Impact: HIGH (Returns first match only; less memory and faster execution)**

Use `ANY` JOINs when you only need a single match rather than all matches. They consume less memory and execute faster.

**Incorrect: returns all matches**

```sql
-- Returns all matching rows, uses more memory
SELECT o.order_id, c.name
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id;
```

**Correct: returns first match only**

```sql
-- Returns only first match per row, faster and less memory
SELECT o.order_id, c.name
FROM orders o
LEFT ANY JOIN customers c ON c.id = o.customer_id;
```

**ANY JOIN types:**

| Type | Behavior |

|------|----------|

| `LEFT ANY JOIN` | At most one match from right table |

| `INNER ANY JOIN` | At most one match, only matching rows |

| `RIGHT ANY JOIN` | At most one match from left table |

Reference: [https://clickhouse.com/docs/best-practices/minimize-optimize-joins](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.14 Use Data Skipping Indices for Non-ORDER BY Filters

**Impact: HIGH (Up to 60x faster queries by skipping irrelevant granules)**

Queries filtering on columns not in ORDER BY cannot use the primary index and result in full scans. Data skipping indices store metadata about blocks and skip granules that definitely don't match.

**Important:** Skip indices should be considered **after** optimizing data types, primary key selection, and materialized views.

**When to use:**

- High overall cardinality but low cardinality within blocks

- Rare values critical for search (error codes, specific IDs)

- Column correlates with primary key

**When NOT to use:**

- As a first optimization step

- Matching values scattered across many blocks

- Without testing on real data

**Incorrect: filtering on non-ORDER BY column**

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

**Correct: add skipping index**

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

| `ngrambf_v1` | Text search | `WHERE text LIKE '%term%'` |

| `tokenbf_v1` | Token search | `WHERE hasToken(text, 'word')` |

**Validation:**

```sql
EXPLAIN indexes = 1
SELECT * FROM events WHERE user_id = 12345;
-- Look for "Skip" in output showing granules skipped
```

To confirm the index is used in production queries, see [query-index-verify-usage](query-index-verify-usage.md).

Reference: [https://clickhouse.com/docs/best-practices/use-data-skipping-indices-where-appropriate](https://clickhouse.com/docs/best-practices/use-data-skipping-indices-where-appropriate)

### 2.15 Use Incremental MVs for Real-Time Aggregations

**Impact: HIGH (Read thousands of rows instead of billions; minimal cluster overhead)**

Incremental MVs automatically apply the view's query to new data blocks at insert time. Results are written to a target table and partial results merge over time.

**Incorrect: full aggregation on every query**

```sql
-- Full aggregation on every dashboard load
SELECT
    event_type,
    toStartOfHour(timestamp) as hour,
    count() as events,
    uniq(user_id) as unique_users
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY event_type, hour;
-- Scans 7 days of data every time (billions of rows)
```

**Correct: incremental MV with pre-aggregation**

```sql
-- Create target table for aggregated data
CREATE TABLE events_hourly (
    event_type LowCardinality(String),
    hour DateTime,
    events AggregateFunction(count),
    unique_users AggregateFunction(uniq, UInt64)
)
ENGINE = AggregatingMergeTree()
ORDER BY (event_type, hour);

-- Create materialized view to populate incrementally
CREATE MATERIALIZED VIEW events_hourly_mv TO events_hourly AS
SELECT
    event_type,
    toStartOfHour(timestamp) as hour,
    countState() as events,
    uniqState(user_id) as unique_users
FROM events
GROUP BY event_type, hour;

-- Query the pre-aggregated data
SELECT
    event_type, hour,
    countMerge(events) as events,
    uniqMerge(unique_users) as unique_users
FROM events_hourly
WHERE hour >= now() - INTERVAL 7 DAY
GROUP BY event_type, hour;
-- Reads thousands of rows instead of billions
```

**Key points:**

- Use `-State` functions in MV, `-Merge` functions in query

- Incremental - existing data not automatically included (backfill separately)

- Minimal cluster overhead at insert time

Reference: [https://clickhouse.com/docs/best-practices/use-materialized-views](https://clickhouse.com/docs/best-practices/use-materialized-views)

### 2.16 Use Refreshable MVs for Complex Joins and Batch Workflows

**Impact: HIGH (Sub-millisecond queries with periodic refresh; ideal for complex joins)**

Refreshable MVs execute queries periodically on a schedule. The full query re-executes and overwrites (or appends to) the target table.

**Best for:**

- Sub-millisecond latency where minor staleness is acceptable

- Caching "top N" results or lookup tables

- Complex multi-table joins requiring denormalization

- Batch workflows and DAG dependencies

**Incorrect: expensive join on every request**

```sql
-- Complex join executed on every request
SELECT
    o.order_id, o.total,
    c.name as customer_name,
    p.name as product_name
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
WHERE o.created_at >= now() - INTERVAL 1 DAY;
```

**Correct: refreshable MV**

```sql
-- Create refreshable MV that runs every 5 minutes
CREATE MATERIALIZED VIEW orders_denormalized
REFRESH EVERY 5 MINUTE
ENGINE = MergeTree()
ORDER BY (created_at, order_id)
AS SELECT
    o.order_id, o.created_at, o.total,
    c.name as customer_name, c.segment,
    p.name as product_name
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
WHERE o.created_at >= now() - INTERVAL 1 DAY;

-- Query the pre-joined data (sub-millisecond)
SELECT * FROM orders_denormalized WHERE segment = 'enterprise';
```

**APPEND vs REPLACE modes:**

| Mode | Behavior | Use Case |

|------|----------|----------|

| `REPLACE` (default) | Overwrites previous contents | Current state, lookup tables |

| `APPEND` | Adds new rows to existing data | Periodic snapshots, historical accumulation |

**Critical warning:** Query should run quickly compared to refresh interval. Don't schedule every 10 seconds if the query takes 10+ seconds.

**Monitor refreshes** in `system.view_refreshes`, which shows failures and stale views:**

```sql
SELECT database, view, status, last_success_time, last_refresh_time,
       next_refresh_time, retry, substring(exception, 1, 200) AS exception
FROM system.view_refreshes
WHERE exception != '' OR last_success_time IS NULL
   OR last_success_time < now() - INTERVAL 1 DAY
LIMIT 50;
```

Reference: [https://clickhouse.com/docs/best-practices/use-materialized-views](https://clickhouse.com/docs/best-practices/use-materialized-views)

### 2.17 Verify That Indexes and Projections Are Actually Used

**Impact: HIGH (An index or projection that exists but is not chosen reads every granule; EXPLAIN and query_log show which one happened)**

A sort key, skip index, or projection being defined on a table does not mean a query uses it. Check the plan before you claim an improvement, and check the completed query afterwards. Duration alone is weak evidence because caches and concurrency also change it.

**Incorrect: assuming the index applies because the column is indexed**

```sql
-- Table: ORDER BY (tenant_id, event_time),
--        INDEX idx_user user_id TYPE bloom_filter, PROJECTION by_user (... ORDER BY user_id)

-- A non-monotonic function on the key column: the primary key is not used
SELECT count() FROM events WHERE tenant_id % 10 = 2;

-- The skip index is defined on user_id, not on user_id + 1: the index is not used
SELECT sum(amount) FROM events WHERE user_id + 1 = 123457;
```

**Correct: read the plan, then the completed query**

```sql
-- 1. Before running: which parts and granules each index keeps
EXPLAIN indexes = 1
SELECT sum(amount) FROM events WHERE tenant_id = 42;
-- PrimaryKey  Condition: (tenant_id in [42, 42])   Granules: 7/611   -> key used
-- PrimaryKey  Condition: true                      Granules: 611/611 -> key not used
-- Skip        Name: idx_user ... Granules: 22/611  -> skip index applied (absent = not applied)
-- ReadFromMergeTree (by_user)                      -> projection chosen instead of the table

-- 2. After running: what the query actually read
SELECT
    event_time,
    projections,
    read_rows,
    ProfileEvents['SelectedMarks'] AS marks_read,
    ProfileEvents['SelectedMarksTotal'] AS marks_total,
    query_duration_ms
FROM system.query_log
WHERE event_date >= today() - 1
  AND type = 'QueryFinish'
  AND has(tables, 'default.events')
ORDER BY event_time DESC
LIMIT 20;
```

`projections` lists the projections used, including the implicit `_minmax_count_projection`. `SelectedMarksTotal` needs 24.8 or later. In 24.x and 25.x, `system.query_log` has no column that lists the skip indexes used. For skip indexes, use EXPLAIN or the assertion settings below. On ClickHouse Cloud, read the log through `clusterAllReplicas('default', system.query_log)`. `EXPLAIN projections = 1` (25.6 and later) also lists projections that were analyzed but not chosen.

**Assertions for tests and CI:**

```sql
SELECT sum(amount) FROM events WHERE tenant_id = 42
SETTINGS force_primary_key = 1, optimize_use_projections = 0;

SELECT sum(amount) FROM events WHERE user_id = 123456
SETTINGS force_data_skipping_indices = 'idx_user', optimize_use_projections = 0;

SELECT sum(amount) FROM events WHERE user_id = 123456
SETTINGS force_optimize_projection_name = 'by_user';
```

A failed assertion throws `INDEX_NOT_USED` (277) or `PROJECTION_NOT_USED` (584) instead of running a full scan. These settings have two limits:

- They check that a usable condition exists, not that it prunes. `tenant_id >= 0` passes `force_primary_key` while reading every mark.

- They check every MergeTree read in the query. On 25.3, with a projection defined, `force_primary_key` rejected `tenant_id = 42` and named the projection's key, even though the table's own key pruned to 7/611 granules. Add `optimize_use_projections = 0` when you assert on the base table's key. See also [#116338](https://github.com/ClickHouse/ClickHouse/issues/116338) for queries that read more than one table.

**Reasons an index is not used: reproduced on 25.3**

| Pattern | Result |

|---------|--------|

| Non-monotonic function on a key column (`tenant_id % 10`, `formatDateTime(event_time, ...)`, `if(...)`) | Primary key not used |

| Monotonic function (`toDate`, `toStartOfHour`, `toUnixTimestamp`) or a string literal compared with a numeric or DateTime key | Primary key still used |

| `OR` with a column outside the key (`tenant_id = 42 OR status = 'error'`) | Primary key not used |

| Skip-index expression differs from the filter (`user_id + 1 = ...` for an index on `user_id`) | Skip index not used |

| `SELECT ... FINAL` on a table with a projection | Projection not used on 25.3; test your version |

| Skip index with `FINAL` | Depends on `use_skip_indexes_if_final` (default 0 before 25.6, 1 from 25.6) |

| `count()`, `min()`, `max()` after a lightweight `DELETE` | Trivial count and `_minmax_count_projection` stop being used, even after `OPTIMIZE ... FINAL` on 25.3 ([#66699](https://github.com/ClickHouse/ClickHouse/issues/66699)) |

For filters that skip a leading key column, see [schema-pk-filter-on-orderby](schema-pk-filter-on-orderby.md). For when to add a skip index at all, see [query-index-skipping-indices](query-index-skipping-indices.md).

Reference: [https://clickhouse.com/docs/reference/statements/explain](https://clickhouse.com/docs/reference/statements/explain), [https://clickhouse.com/docs/reference/settings/session-settings/force](https://clickhouse.com/docs/reference/settings/session-settings/force), [https://clickhouse.com/docs/reference/system-tables/query_log](https://clickhouse.com/docs/reference/system-tables/query_log)

---

## 3. Insert Strategy

**Impact: CRITICAL**

Each INSERT creates a data part. Single-row inserts overwhelm the merge process. Proper batching (10K-100K rows), async inserts for high-frequency writes, mutation avoidance, and letting background merges work are essential for stable cluster performance.

### 3.1 Account for the Read Cost of Lightweight DELETE Until Parts Merge

**Impact: MEDIUM (Masked parts add a filter to every read and can turn metadata-only count() into a full scan)**

Lightweight `DELETE FROM` is cheaper to run than `ALTER TABLE ... DELETE` (see [insert-mutation-avoid-delete](insert-mutation-avoid-delete.md)), but the deleted rows stay on disk. ClickHouse writes a hidden `_row_exists` mask into affected parts and removes the rows only when those parts are later merged. Until then:

- Every query on a masked part also reads `_row_exists` and filters on it.

- `count()` without `WHERE`, and `min()`/`max()` of partition-key columns or the first sorting-key column, can no longer be answered from part metadata and read the column data instead. On 25.3, `SELECT count()` over 2M rows went from `read_rows = 1` to `read_rows = 2000000` after deleting 10 rows. Before 26.4, this lasted even after the masked parts merged away; in the 25.3 test it cleared only after `DETACH TABLE`/`ATTACH TABLE` ([#101212](https://github.com/ClickHouse/ClickHouse/pull/101212), [#66699](https://github.com/ClickHouse/ClickHouse/issues/66699)).

- `DELETE FROM` is itself a mutation. It queues behind any unfinished mutation, and by default (`lightweight_deletes_sync = 2`) the statement waits for it. See [insert-mutation-diagnose-stuck](insert-mutation-diagnose-stuck.md).

- In compact parts, the delete rewrites all columns, because they are stored in one file.

The logical delete does not tell you when the data leaves storage.

**Incorrect: assuming the DELETE is free once it returns**

```sql
DELETE FROM events WHERE user_id = 42;

-- Expected to stay instant; on affected versions it now scans the table
SELECT count() FROM events;
```

**Correct: find masked parts and measure the effect**

```sql
-- Active parts that still carry a delete mask
SELECT partition, name, rows, formatReadableSize(bytes_on_disk) AS size
FROM system.parts
WHERE active AND database = 'db' AND table = 'events' AND has_lightweight_delete
ORDER BY rows DESC
LIMIT 50;

-- Compare rows read by count() before and after a DELETE (tag the queries with log_comment)
SELECT event_time, log_comment, read_rows, formatReadableSize(read_bytes) AS read, query_duration_ms
FROM system.query_log
WHERE event_date >= today() - 1
  AND type = 'QueryFinish'
  AND log_comment IN ('count_before_delete', 'count_after_delete')
ORDER BY event_time
LIMIT 20;
```

`system.parts_columns WHERE column = '_row_exists'` gives the same list of parts. If masked parts linger, you can remove the deleted rows early with `ALTER TABLE events APPLY DELETED MASK [IN PARTITION ...]`. The table setting `min_age_to_force_merge_seconds` forces merges of old parts, but on 25.3 it did not rewrite a partition that is already a single part, so that part kept its mask. Both rewrite data: plan them like any other mutation and run them only with the table owner's approval. For frequent or bulk deletes, prefer the partition and engine alternatives in [insert-mutation-avoid-delete](insert-mutation-avoid-delete.md).

Reference: [https://clickhouse.com/docs/reference/statements/delete](https://clickhouse.com/docs/reference/statements/delete), [https://clickhouse.com/docs/reference/statements/alter/apply-deleted-mask](https://clickhouse.com/docs/reference/statements/alter/apply-deleted-mask)

### 3.2 Avoid ALTER TABLE DELETE

**Impact: CRITICAL (Use lightweight DELETE, CollapsingMergeTree, or DROP PARTITION instead)**

`ALTER TABLE DELETE` is a mutation that rewrites entire data parts. Use alternatives like lightweight DELETE, CollapsingMergeTree, or DROP PARTITION.

**Incorrect: mutation delete**

```sql
-- Mutation delete for cleanup
ALTER TABLE orders DELETE WHERE status = 'cancelled';

-- Time-based cleanup via mutation (very expensive)
ALTER TABLE sessions DELETE WHERE created_at < now() - INTERVAL 7 DAY;
```

**Correct - CollapsingMergeTree:**

```sql
CREATE TABLE orders (
    order_id UInt64,
    customer_id UInt64,
    total Decimal(10,2),
    sign Int8  -- 1 = active, -1 = deleted
)
ENGINE = CollapsingMergeTree(sign)
ORDER BY order_id;

-- Insert order
INSERT INTO orders VALUES (123, 456, 99.99, 1);

-- "Delete" by inserting with sign = -1
INSERT INTO orders VALUES (123, 456, 99.99, -1);

-- Query collapses +1 and -1 pairs
SELECT order_id, sum(total * sign) as total
FROM orders GROUP BY order_id HAVING sum(sign) > 0;
```

**Correct - Lightweight Deletes (23.3+):**

```sql
-- Marks rows, doesn't rewrite immediately
DELETE FROM orders WHERE status = 'cancelled';
-- Physical deletion happens during normal merges
```

Masked rows stay on disk, and queries pay to filter them, until merges rewrite the parts. See [insert-mutation-lightweight-delete-cost](insert-mutation-lightweight-delete-cost.md).

**Correct - DROP PARTITION for Bulk Deletion:**

```sql
-- Instant deletion of old data
ALTER TABLE events DROP PARTITION '202301';

-- Much faster than:
ALTER TABLE events DELETE WHERE toYYYYMM(timestamp) = 202301;
```

**Delete strategy comparison:**

| Method | Speed | When to Use |

|--------|-------|-------------|

| ALTER DELETE | Slow | Rare corrections only |

| CollapsingMergeTree | Fast | Frequent soft deletes |

| Lightweight DELETE | Medium | Occasional deletes |

| DROP PARTITION | Instant | Bulk deletion by partition |

Reference: [https://clickhouse.com/docs/best-practices/avoid-mutations](https://clickhouse.com/docs/best-practices/avoid-mutations)

### 3.3 Avoid ALTER TABLE UPDATE

**Impact: CRITICAL (Use lightweight UPDATE or ReplacingMergeTree instead)**

`ALTER TABLE UPDATE` is a mutation that rewrites entire data parts affected by the change. Use alternatives like lightweight UPDATE or ReplacingMergeTree.

**Why mutations are problematic:**

- **Write amplification:** Rewrite complete parts even for minor changes

- **Disk I/O spike:** Degrades overall cluster performance

- **No rollback:** Cannot be rolled back after submission

- **Inconsistent reads:** SELECT may read mix of mutated and unmutated parts

**Incorrect: mutation update**

```sql
-- Rewrites potentially huge amounts of data
ALTER TABLE users UPDATE status = 'inactive'
WHERE last_login < now() - INTERVAL 90 DAY;

-- Frequent row updates via mutation
ALTER TABLE inventory UPDATE quantity = quantity - 1
WHERE product_id = 123;
-- If product exists across 100 parts, rewrites ALL 100 parts
```

**Correct - ReplacingMergeTree:**

```sql
CREATE TABLE users (
    user_id UInt64,
    name String,
    status LowCardinality(String),
    updated_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY user_id;

-- "Update" by inserting new version
INSERT INTO users (user_id, name, status)
VALUES (123, 'John', 'inactive');

-- Query with FINAL to get latest version
SELECT * FROM users FINAL WHERE user_id = 123;

-- Or use aggregation
SELECT user_id, argMax(status, updated_at) as status
FROM users GROUP BY user_id;
```

**Correct - Lightweight Updates (25.7+):**

```sql
-- Writes a patch, doesn't rewrite parts immediately
UPDATE users SET status = 'inactive'
WHERE last_login < now() - INTERVAL 90 DAY;
-- Patches are applied during normal merges
```

**Update strategy comparison:**

| Method | Speed | When to Use |

|--------|-------|-------------|

| ALTER UPDATE | Slow | Rare corrections only |

| ReplacingMergeTree | Fast | Frequent updates |

| Lightweight UPDATE | Medium | Occasional updates |

Reference: [https://clickhouse.com/docs/best-practices/avoid-mutations](https://clickhouse.com/docs/best-practices/avoid-mutations)

### 3.4 Avoid OPTIMIZE TABLE FINAL

**Impact: HIGH (Forces expensive merge of all parts; let background merges work)**

`OPTIMIZE TABLE ... FINAL` forces immediate merge of all parts into one part per partition. This is resource-intensive and rarely necessary. ClickHouse already performs smart background merges.

**Note:** `OPTIMIZE FINAL` is not the same as `FINAL`. The `FINAL` modifier in SELECT queries may be necessary for deduplicated results in ReplacingMergeTree and is generally fine to use.

**Incorrect: OPTIMIZE FINAL after inserts**

```sql
-- Running OPTIMIZE FINAL after every batch insert
INSERT INTO events SELECT * FROM staging_events;
OPTIMIZE TABLE events FINAL;  -- Expensive and unnecessary!

-- Scheduled OPTIMIZE FINAL jobs
-- Cron: 0 * * * * clickhouse-client -q "OPTIMIZE TABLE events FINAL"
```

**Correct: let background merges work**

```sql
-- Let background merges handle optimization
INSERT INTO events SELECT * FROM staging_events;
-- Done! ClickHouse merges automatically

-- For ReplacingMergeTree deduplication, use FINAL in queries
SELECT * FROM events FINAL WHERE user_id = 123;
-- Instead of running OPTIMIZE FINAL to deduplicate
```

**Problems with OPTIMIZE FINAL:**

- Rewrites entire partition regardless of need

- Ignores the ~150 GB part size safeguard

- Can cause memory pressure or OOM errors

- Lengthy execution time for large datasets

**When OPTIMIZE FINAL may be acceptable:**

- Finalizing data before table freezing

- Preparing data for export operations

- One-time operations, not regular workflows

**Better alternatives:**

| Need | Alternative |

|------|-------------|

| Deduplicate ReplacingMergeTree | Use `FINAL` modifier in SELECT |

| Reduce part count | Rely on background merges |

Reference: [https://clickhouse.com/docs/best-practices/avoid-optimize-final](https://clickhouse.com/docs/best-practices/avoid-optimize-final)

### 3.5 Batch Inserts Appropriately (10K-100K rows)

**Impact: CRITICAL (Each INSERT creates a part; single-row inserts overwhelm merge process)**

Each INSERT creates a new data part. Single-row or small-batch inserts create thousands of tiny parts, overwhelming the merge process and causing cluster instability.

**Incorrect: single-row or tiny batches**

```python
# Single-row inserts - creates 10,000 parts!
for event in events:
    client.execute("INSERT INTO events VALUES", [event])

# Tiny batches - still too many parts
for batch in chunks(events, 100):  # 100 rows per INSERT
    client.execute("INSERT INTO events VALUES", batch)
```

**Correct: proper batch size**

```python
# Ideal batch size: 10,000-100,000 rows
BATCH_SIZE = 10_000
for batch in chunks(events, BATCH_SIZE):
    client.execute("INSERT INTO events VALUES", batch)
```

**Recommended batch sizes:**

| Threshold | Value |

|-----------|-------|

| Minimum | 1,000 rows |

| Ideal range | 10,000-100,000 rows |

| Insert rate (sync) | ~1 insert per second |

**Validation:**

```sql
-- Monitor part count (>3000 per partition blocks inserts)
SELECT table, count() as parts, sum(rows) as total_rows
FROM system.parts
WHERE active AND database = 'default'
GROUP BY table
ORDER BY parts DESC;
```

If inserts are already delayed or rejected, see [insert-too-many-parts-diagnose](insert-too-many-parts-diagnose.md).

Reference: [https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy](https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy)

### 3.6 Check asynchronous_insert_log When Using wait_for_async_insert=0

**Impact: HIGH (Fire-and-forget async inserts return success for data that later fails to parse or flush)**

With `async_insert = 1` and `wait_for_async_insert = 0`, the server acknowledges an INSERT once the data is in its in-memory buffer. Parsing, type checks, and the write to the table happen later, at flush time. If they fail, the client never finds out: the HTTP response is `200`, and the INSERT's own `system.query_log` row is a `QueryFinish` with no exception. `system.asynchronous_insert_log` records the outcome of every buffered INSERT.

On 25.3, the two failure types looked like this:

- **`ParsingError`**: one malformed row rejects every row from that INSERT, not only the bad row. No `query_log` row carries the error.

- **`FlushError`**: the flush itself fails, for example with `TOO_MANY_PARTS`, and the buffered rows are not written. The error appears in `query_log` only on the separate flush query (`query_kind = 'AsyncInsertFlush'`).

For how to enable async inserts and choose a return mode, see [insert-async-small-batches](insert-async-small-batches.md). Before relying on the defaults, check them on your version: `async_insert` is enabled by default from 26.2, and several defaults differ on ClickHouse Cloud.

**Incorrect: treating the acknowledgement as proof of the write**

```sql
-- id is UInt64. Returns success as soon as the row is buffered
INSERT INTO events SETTINGS async_insert = 1, wait_for_async_insert = 0
VALUES ('not-a-number');

-- Looks clean even though nothing was written: parse errors are not in
-- query_log, and flush errors are logged under query_kind 'AsyncInsertFlush'
SELECT query_id, exception_code
FROM system.query_log
WHERE event_date = today() AND exception_code != 0 AND query_kind = 'Insert'
LIMIT 20;
```

**Correct: alert on non-Ok flush outcomes**

```sql
-- On ClickHouse Cloud, clusterAllReplicas reads every replica's buffer log
SELECT
    toStartOfFiveMinutes(event_time) AS t,
    database,
    table,
    status,
    count() AS inserts,
    any(substring(exception, 1, 200)) AS sample_error
FROM clusterAllReplicas('default', system.asynchronous_insert_log)
WHERE event_date >= today() - 1
  AND event_time > now() - INTERVAL 6 HOUR
  AND status != 'Ok'
GROUP BY t, database, table, status
ORDER BY t DESC
LIMIT 100;
```

`query_id` in this log is the ID of the original INSERT, and `flush_query_id` is the ID of the flush query that wrote the batch, so you can join either to `system.query_log`. The `rows` column is `0` for a `ParsingError`, so count failed inserts, not rows. The server-wide `FailedAsyncInsertQuery` counter in `system.events` shows whether any failures have happened since startup.

This log exists only when the server config enables the `asynchronous_insert_log` section. If `SELECT count() FROM system.asynchronous_insert_log` fails or returns nothing while async inserts are running, you have no record of flush errors: switch to `wait_for_async_insert = 1`.

**Flush timing, for reading the log:**

- A buffer is kept per table, query shape, and settings combination, on each server. Inserts with different settings do not share a buffer.

- A buffer flushes when it reaches `async_insert_max_data_size`, or when the busy timeout expires. With `async_insert_use_adaptive_busy_timeout` (default since 24.2) the timeout moves between `async_insert_busy_timeout_min_ms` and `async_insert_busy_timeout_max_ms`.

- `async_insert_max_query_number` triggers a flush only when deduplication is enabled for the insert. Before 26.2, async insert deduplication was off by default.

- Each flush writes at least one part per partition in the buffer, so a high-cardinality partition key still produces many parts.

Reference: [https://clickhouse.com/docs/concepts/features/operations/insert/asyncinserts](https://clickhouse.com/docs/concepts/features/operations/insert/asyncinserts)

### 3.7 Diagnose Stuck Mutations Before Killing or Resubmitting

**Impact: HIGH (A mutation that fails on one part retries indefinitely and blocks every later mutation on the table)**

`ALTER TABLE ... UPDATE/DELETE`, column type changes (`MODIFY COLUMN x NewType`), lightweight `DELETE FROM`, `MATERIALIZE INDEX/TTL/COLUMN`, and column `RENAME`/`DROP` all run as mutations, and a table's mutations run in order. If a mutation throws on one part (for example a type cast that fails on some rows), it keeps retrying that part until it is killed. Every later mutation, including a lightweight `DELETE`, waits behind it. With the default `mutations_sync = 0`, `ALTER ... UPDATE/DELETE` returns success before any part is processed, so the client never sees the error. A type change waits for its mutation (`alter_sync = 1`) and fails with `UNFINISHED` (Code 341), but the mutation stays queued. Once a table has `number_of_mutations_to_delay` unfinished mutations, new ones are slowed down. At `number_of_mutations_to_throw` they are rejected with `TOO_MANY_MUTATIONS` (Code 692). Check the effective values on your server and any table-level overrides in `SHOW CREATE TABLE`.

A mutation can also be slow without failing: it cannot mutate a part while a merge owns that part, so `parts_to_do` stays flat, with no `latest_fail_reason`, until a large merge finishes.

**Incorrect: reacting without reading the failure**

```sql
-- Resubmitting the same ALTER adds another mutation that fails the same way
ALTER TABLE events UPDATE amount = toUInt32(amount_str) WHERE 1;

-- Raising the limit only lets the backlog grow
ALTER TABLE events MODIFY SETTING number_of_mutations_to_throw = 10000;

-- Kills every mutation on the table, including unrelated healthy ones
KILL MUTATION WHERE database = 'db' AND table = 'events';
```

**Correct: find the failing mutation, then decide**

```sql
ALTER TABLE events MODIFY COLUMN x Nullable(UInt32);
ALTER TABLE events UPDATE x = 0 WHERE x IS NULL SETTINGS mutations_sync = 2;  -- choose the fill value deliberately
ALTER TABLE events MODIFY COLUMN x UInt32;
```

If a merge holds the parts and `parts_to_do` decreases between checks, the mutation is healthy and waiting. If it has a failure reason, fix the data or rewrite the command so it cannot throw (for example `toUInt32OrZero` instead of `toUInt32`). Then, with the user's explicit approval, kill only that mutation, using the exact `mutation_id` from `system.mutations` (`mutation_42.txt` on `MergeTree`, `0000000042` on replicated tables). Preview it with `TEST` first:

`KILL MUTATION` is not an undo: parts it already rewrote keep the new values, and parts it had not reached keep the old ones. Metadata changes also stay. For example, `MODIFY COLUMN x UInt32` on a `Nullable(UInt32)` column that contains NULLs changes the table definition, then fails on every part that has NULLs. After the kill, the column is still declared `UInt32`, and on 25.3 reading `x` fails with Code 349. To recover, with the same approval, change the column back to its old type, fill in the NULLs, and wait for that `UPDATE` to finish before changing the type again. On 25.3, when the `UPDATE` was still pending, ClickHouse applied both mutations to the part in one pass and the cast failed again:

On ClickHouse Cloud, a killed mutation can show `is_killed = 1` with `is_done = 0` for some time while other work on the table finishes. The docs describe this as normal.

Reference: [https://clickhouse.com/docs/reference/statements/kill#kill-mutation](https://clickhouse.com/docs/reference/statements/kill#kill-mutation), [https://clickhouse.com/docs/reference/system-tables/mutations](https://clickhouse.com/docs/reference/system-tables/mutations)

### 3.8 Diagnose TOO_MANY_PARTS Before Changing Thresholds

**Impact: HIGH (Find whether part creation, partition fan-out, or stalled merges cause insert throttling; raising limits only hides it)**

MergeTree throttles inserts when a partition has too many active parts. At `parts_to_delay_insert` it logs `Delaying inserting block by N ms` and counts `DelayedInserts`. At `parts_to_throw_insert` it fails with `TOO_MANY_PARTS` (code 252). The check uses the **busiest partition in the table**: on 25.3, once one partition reached the limit, inserts into a different partition of the same table were rejected too. The check is skipped when that partition's average part size exceeds `max_avg_part_size_for_too_many_parts`.

The same error code has other causes. Read the message:

| Message | Limit | Usual cause |

|---|---|---|

| `Too many parts (N with average size of ...)` | `parts_to_throw_insert` | Parts are created faster than they merge |

| `Too many parts (N) in all partitions in total` | `max_parts_in_total` | Too many partitions |

| `Too many partitions for single INSERT block` | `max_partitions_per_insert_block` | One INSERT spans many partitions |

**Incorrect: reading only server defaults, then raising the limit**

```sql
-- Shows server-level defaults, not per-table SETTINGS overrides
SELECT name, value FROM system.merge_tree_settings
WHERE name IN ('parts_to_delay_insert', 'parts_to_throw_insert');

-- Treats the symptom; merge debt keeps growing
ALTER TABLE events MODIFY SETTING parts_to_throw_insert = 10000;
```

**Correct: find the partition, the creation rate, and merge progress**

```sql
-- 1. Which partitions are near the limit, and are the parts unmerged (level 0)?
SELECT database, table, partition_id, count() AS active_parts,
       countIf(level = 0) AS unmerged_parts,
       formatReadableSize(median(bytes_on_disk)) AS median_part_size
FROM system.parts
WHERE active
GROUP BY database, table, partition_id
ORDER BY active_parts DESC
LIMIT 20;

-- 2. New parts per minute and their size, compared with merges and failures.
-- event_type is an Enum, so string comparison is correct
SELECT toStartOfMinute(event_time) AS minute,
       countIf(event_type = 'NewPart') AS new_parts,
       round(avgIf(rows, event_type = 'NewPart')) AS avg_rows_per_new_part,
       countIf(event_type = 'MergeParts') AS merges,
       countIf(error != 0) AS failed_events
FROM clusterAllReplicas('default', system.part_log)
WHERE event_date >= today() - 1 AND event_time > now() - INTERVAL 3 HOUR
  AND database = 'default' AND table = 'events'
GROUP BY minute
ORDER BY minute DESC
LIMIT 180;

-- 3. Inserts that fan out over many partitions
SELECT query_id, count() AS parts_written, uniqExact(partition_id) AS partitions
FROM clusterAllReplicas('default', system.part_log)
WHERE event_date >= today() - 1 AND event_time > now() - INTERVAL 1 HOUR
  AND event_type = 'NewPart' AND database = 'default' AND table = 'events'
GROUP BY query_id
ORDER BY partitions DESC
LIMIT 20;

-- 4. Merges running now: long, stuck, or none at all
SELECT hostName() AS host, table, round(elapsed) AS elapsed_s,
       round(progress, 2) AS progress, num_parts, is_mutation,
       formatReadableSize(total_size_bytes_compressed) AS size
FROM clusterAllReplicas('default', system.merges)
WHERE database = 'default'
ORDER BY elapsed DESC
LIMIT 20;

-- 5. Effective per-table overrides
SELECT name, extract(engine_full, 'SETTINGS (.*)$') AS table_settings
FROM system.tables
WHERE database = 'default' AND name = 'events';
```

How to read the results:

- **Many small `NewPart` rows per minute, with merges running:** part creation outpaces merging. Batch larger ([insert-batch-size](insert-batch-size.md)) or use async inserts ([insert-async-small-batches](insert-async-small-batches.md)).

- **Each insert writes one part per partition, across many partitions:** the partition key is too fine for the insert pattern ([schema-partition-low-cardinality](schema-partition-low-cardinality.md)).

- **Parts accumulate while `system.merges` is empty or shows one long merge:** this does not by itself mean merges have stopped. Look for failing merges (`error != 0` and `exception` in `part_log`), and a long-running merge or mutation holding the pool, before restarting or changing merge settings.

- **One replica has far more `NewPart` events or fewer merges:** group queries 2 and 4 by `hostName()` to compare replicas (see [agent-system-tables-read-safely](agent-system-tables-read-safely.md) for checking replica coverage). On a sharded cluster, also check whether inserts reach every shard evenly.

If the owner approves temporarily raising a threshold to keep ingestion running, record the old value and the condition for restoring it.

Reference: [https://clickhouse.com/docs/resources/support-center/knowledge-base/troubleshooting/exception-too-many-parts](https://clickhouse.com/docs/resources/support-center/knowledge-base/troubleshooting/exception-too-many-parts)

### 3.9 Retry Failed Inserts With the Same Data, Settings, and Token

**Impact: HIGH (Block deduplication makes retries safe, but rebatched retries duplicate rows and identical new batches are silently dropped)**

When an INSERT times out or the connection drops, you cannot tell whether it was written. ClickHouse makes the retry safe by hashing each inserted block into a `block_id` and skipping any block whose ID is already in the table's deduplication log. A skipped block still returns success.

What is deduplicated depends on the table and the version:

- `ReplicatedMergeTree` keeps a log of recent block IDs by default, bounded by `replicated_deduplication_window` and `replicated_deduplication_window_seconds`. Both defaults changed recently (to 10,000 blocks in 25.9, and from one week to one hour in 25.10), so check your values. On ClickHouse Cloud, `SharedMergeTree` replaces `ReplicatedMergeTree`; check the same settings there.

- Plain `MergeTree` deduplicates nothing unless `non_replicated_deduplication_window` is set above `0`.

- Before 26.2, asynchronous inserts and materialized-view targets were not deduplicated by default. From 26.2, `deduplicate_insert` (default `enable`) covers sync and async inserts, and `deduplicate_blocks_in_dependent_materialized_views` defaults to `1`.

Two opposite failures follow from this:

- **Duplicates.** A retry that sends different blocks (rows regrouped, a record appended, different block-size settings) produces new hashes and is written again. So is a retry that arrives after the window has expired.

- **Silent drops.** A new batch whose rows exactly match a recent one is discarded, and so is a batch that reuses an `insert_deduplication_token` with different data. `query_log.written_rows` still counts the dropped rows (and also includes rows written to materialized views), so it cannot show deduplication.

With the pre-26.2 defaults (tested on 25.3), a retried identical insert was dropped from the source table but written twice into a materialized view's target. The target needs its own deduplication log and `deduplicate_blocks_in_dependent_materialized_views = 1` for the view to deduplicate too.

**Incorrect: retry rebuilds the batch, or tokens are reused**

```python
try:
    client.insert("events", batch)
except TimeoutError:
    # New rows were added, so the blocks hash differently and the rows
    # that were already written are inserted a second time
    client.insert("events", batch + new_events)

# One constant token for every batch: all batches after the first are dropped
client.insert("events", batch, settings={"insert_deduplication_token": "loader"})
```

**Correct: one stable token per logical batch; identical retries**

```python
token = f"{source}:{partition}:{offset_start}-{offset_end}"
for attempt in range(5):
    try:
        client.insert("events", batch,  # same rows, same order, same settings
                      settings={"insert_deduplication_token": token})
        break
    except (TimeoutError, ConnectionError):
        backoff(attempt)
```

A token also stops legitimately identical batches from being dropped, because the token replaces the data hash. For `INSERT ... SELECT`, the `SELECT` must return the same rows in the same order on every attempt, or you must supply a token. From 26.1, `deduplicate_insert_select` (added in 25.12) defaults to `enable_when_possible`, which deduplicates an `INSERT ... SELECT` only when the `SELECT` is stable (`ORDER BY ALL`, single stream) or a token is set.

**Check the configuration and detect deduplication:**

```sql
-- Server-level defaults. Per-table overrides appear only in the table DDL
SELECT name, value, changed
FROM system.merge_tree_settings
WHERE name IN ('replicated_deduplication_window',
               'replicated_deduplication_window_seconds',
               'non_replicated_deduplication_window');

SELECT name, engine, extract(engine_full, 'SETTINGS (.*)$') AS table_settings
FROM system.tables
WHERE database = 'default' AND name = 'events';

-- Inserts that were fully or partly deduplicated. On Cloud, this reads all replicas
SELECT event_time, query_id, written_rows,
       ProfileEvents['DuplicatedInsertedBlocks'] AS duplicated_blocks
FROM clusterAllReplicas('default', system.query_log)
WHERE event_date >= today() - 1
  AND event_time > now() - INTERVAL 1 HOUR
  AND type = 'QueryFinish'
  AND query_kind = 'Insert'
  AND ProfileEvents['DuplicatedInsertedBlocks'] > 0
ORDER BY event_time DESC
LIMIT 50;
```

`system.text_log` can also show the skipped block. The wording varies by engine and version: on 25.3, `MergeTree` logs `Block with ID ... already exists as part ...; ignoring it`, which does not contain the word "deduplicate". Search for `already exists` as well as `dedup`, and expect nothing if your text log level excludes these messages. For async inserts, check the `DuplicatedAsyncInserts` event.

Block deduplication only covers retries inside the window. If duplicates can still arrive (replays from a queue, retries after the window), make them harmless in the table design, for example with `ReplacingMergeTree` and deduplicating reads. For buffered inserts, see [insert-async-small-batches](insert-async-small-batches.md).

Reference: [https://clickhouse.com/docs/concepts/features/operations/insert/deduplicating-inserts-on-retries](https://clickhouse.com/docs/concepts/features/operations/insert/deduplicating-inserts-on-retries)

### 3.10 Use Async Inserts for High-Frequency Small Batches

**Impact: HIGH (Server-side buffering when client batching isn't practical)**

When client-side batching isn't practical, async inserts buffer server-side and create larger parts automatically.

**Incorrect: small batches without async**

```python
# Small batches without async_insert - creates too many parts
for batch in chunks(events, 100):
    client.execute("INSERT INTO events VALUES", batch)
```

**Correct: enable async inserts**

```sql
-- Configure server-side for specific users
ALTER USER my_app_user SETTINGS
    async_insert = 1,
    wait_for_async_insert = 1,
    async_insert_max_data_size = 10000000,  -- Flush at 10MB
    async_insert_busy_timeout_ms = 1000;    -- Flush after 1s
```

**Flush conditions: whichever occurs first**

- Buffer reaches `async_insert_max_data_size`

- Time threshold `async_insert_busy_timeout_ms` elapses

- `async_insert_max_query_number` queries accumulate (counted only when async insert deduplication is enabled)

**Return modes:**

| Setting | Behavior | Use Case |

|---------|----------|----------|

| `wait_for_async_insert=1` | Waits for flush, confirms durability | **Recommended** |

| `wait_for_async_insert=0` | Fire-and-forget, unaware of errors | **Risky** - only if you accept data loss |

With `wait_for_async_insert=0`, check flush results on the server; see [insert-async-verify-flushes](insert-async-verify-flushes.md).

Reference: [https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy](https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy)

### 3.11 Use Native Format for Best Insert Performance

**Impact: MEDIUM (Native format is most efficient; JSONEachRow is expensive to parse)**

Data format affects insert performance. Native format is column-oriented with minimal parsing overhead.

**Performance Ranking: fastest to slowest**

| Format | Notes |

|--------|-------|

| **Native** | Most efficient. Column-oriented, minimal parsing. Recommended. |

| **RowBinary** | Efficient row-based alternative |

| **JSONEachRow** | Easier to use but expensive to parse |

**Example:**

```python
# Use Native format for best performance
client.execute("INSERT INTO events VALUES", data, settings={'input_format': 'Native'})
```

Reference: [https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy](https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy)

---

## 4. Agent Integration

**Impact: CRITICAL**

AI agents working with ClickHouse need deliberate connection setup, schema discovery, and safe query execution. Agents that skip discovery write queries that ignore the sort key and scan full tables; agents without safety limits run unbounded queries that exhaust compute budgets. Covers MCP/CLI/HTTP connectivity and credential handling, the schema discovery workflow (databases → tables → columns → sort keys → skip indexes → sample → EXPLAIN), and query safety defaults (LIMIT, `max_execution_time`, `EXPLAIN ESTIMATE`).

### 4.1 Apply Safety Limits to Agent-Generated Queries

**Impact: CRITICAL (Unbounded agent queries can scan billions of rows and saturate cluster resources)**

Every agent-generated query must have explicit safety limits. A single unbounded query can scan billions of rows, consume all memory, or run for minutes.

**Non-negotiable rules:**

- ALWAYS use `LIMIT` to cap returned rows (default `LIMIT 1000`)

- ALWAYS bound scan size with `max_rows_to_read` or `max_bytes_to_read` — `LIMIT` alone does not prevent a full scan

- ALWAYS set `max_execution_time` (default 30)

- NEVER run `SELECT *` on large tables without `LIMIT` and scan caps

- NEVER query without filtering on sort key or partition key columns

**Incorrect:**

```sql
SELECT * FROM events WHERE user_id = '123'
```

**Correct:**

```sql
SELECT *
FROM events
WHERE event_date >= today() - 7 AND user_id = '123'
LIMIT 100
SETTINGS max_execution_time = 30,
         max_rows_to_read = 1000000000,
         timeout_before_checking_execution_speed = 0
```

**Recommended per-query settings:**

| Setting | Recommended | Effect |

|---------|-------------|--------|

| `max_rows_to_read` | 1e9 | Caps rows scanned before materialization — the real guardrail |

| `max_bytes_to_read` | 1e11 | Caps bytes scanned |

| `max_execution_time` | 30 | Interrupts query when projected execution time exceeds N seconds (see `timeout_before_checking_execution_speed`) |

| `timeout_before_checking_execution_speed` | 0 | Makes `max_execution_time` behave as a wall-clock limit (default `10` gives queries 10s of grace before timeouts kick in) |

| `max_estimated_execution_time` | 60 | Rejects queries whose projected runtime exceeds N seconds — kills expensive queries before they start |

| `max_result_rows` | 10000 | Caps output rows |

| `result_overflow_mode` | `'break'` | Returns partial result of ≥ `max_result_rows`, rounded up to the next block boundary (it does not truncate exactly) |

Limits are checked at block boundaries, so actual scans and runtime can overshoot slightly.

**Cloud vs self-hosted defaults that matter:**

| Setting | Self-hosted default | Cloud default |

|---------|---------------------|---------------|

| `max_memory_usage` | `0` (unlimited) | Depends on replica RAM — not unlimited |

| `max_bytes_before_external_group_by` | `0`, but since 25.1 `max_bytes_ratio_before_external_group_by = 0.5` spills at half of available memory | Half the memory per replica — spills automatically |

| `max_bytes_before_external_sort` | `0`, but since 25.1 `max_bytes_ratio_before_external_sort = 0.5` spills at half of available memory | Half the memory per replica — spills automatically |

| `max_rows_to_read` / `max_bytes_to_read` | `0` (unlimited) | `0` (unlimited) — must be set explicitly on both |

| `max_execution_time` | `0` (unlimited) | `0` (unlimited) — must be set explicitly on both |

On self-hosted versions before 25.1, GROUP BY and ORDER BY have no automatic spill threshold — set the `max_bytes_before_external_*` settings explicitly or enforce via profile. From 25.1, the `max_bytes_ratio_before_external_*` settings spill at half of available memory by default. On Cloud, GROUP BY / ORDER BY spill to disk automatically and per-query memory is bounded, but scan and execution-time caps are still your job.

**When things go wrong:**

- **Timeout** (`TIMEOUT_EXCEEDED`): Narrow the time range, add sort key filters, run `EXPLAIN ESTIMATE` to check scan size before retrying. Consider `max_estimated_execution_time` to reject expensive queries up front.

- **Memory error** (`MEMORY_LIMIT_EXCEEDED`): Reduce actual memory use — narrow filters, add `LIMIT`, lower GROUP BY cardinality, enable `max_bytes_before_external_group_by` (already on by default in Cloud and, via the ratio settings, on self-hosted 25.1+), or split into smaller time windows. Raising `max_memory_usage` only helps if you're authorized and the ceiling is genuinely the problem; *lowering* it makes the error happen sooner, not later.

- **Too many parts** (`TOO_MANY_PARTS`): Back off inserts — merges are behind. Wait and retry.

**Role-level hardening (belt-and-suspenders):**

Per-query `SETTINGS` only applies if the agent remembers to emit it. For production, the primary mechanism should be a [settings profile](https://clickhouse.com/docs/operations/settings/settings-profiles) plus [`readonly=2`](https://clickhouse.com/docs/operations/settings/constraints-on-settings#read-only) on the agent's role, so limits apply even when the agent forgets. Per-query settings are then defense in depth, not the fence.

Per-query limits also don't stop abuse via many small queries — use [quotas](https://clickhouse.com/docs/operations/quotas) to bound requests or scanned bytes per interval.

**Progressive exploration pattern:**

```sql
-- 1. Count first (cheap)
SELECT count() FROM events WHERE event_date = today();

-- 2. Small sample (if count is reasonable)
SELECT * FROM events WHERE event_date = today() LIMIT 10;

-- 3. Full query with LIMIT and scan caps
SELECT user_id, count() as events
FROM events
WHERE event_date = today()
GROUP BY user_id
ORDER BY events DESC
LIMIT 100
SETTINGS max_execution_time = 30,
         max_rows_to_read = 1000000000,
         timeout_before_checking_execution_speed = 0;
```

Start narrow, widen only if needed:

Reference: [https://clickhouse.com/docs/operations/settings/query-complexity](https://clickhouse.com/docs/operations/settings/query-complexity), [https://clickhouse.com/docs/operations/settings/query-level](https://clickhouse.com/docs/operations/settings/query-level)

### 4.2 Connect AI Agents to ClickHouse

**Impact: HIGH (Proper connection setup eliminates credential-prompting friction and enables structured access)**

Two connection methods, each with a clear use case. Pick one based on your environment.

**Incorrect: prompting for credentials every time**

```python
# Agent asks the user for host, port, user, password on every session
# Credentials are hardcoded in the prompt or conversation
response = client.query("SELECT 1",
    host="???", user="???", password="???")  # fragile, unsecured
```

**Correct: MCP or CLI with pre-configured credentials**

```bash
# MCP: credentials configured once via env vars or OAuth
claude mcp add --transport http clickhouse-cloud https://mcp.clickhouse.cloud/mcp

# CLI: credentials in a named profile or env vars
clickhouse client --host abc123.clickhouse.cloud --port 9440 --secure \
  --user default --password "$CLICKHOUSE_PASSWORD" --format JSON \
  --query "SELECT 1"
```

Best for schema discovery, iterative analysis, and multi-step conversations.

**ClickHouse Cloud — zero-install hosted MCP:**

```bash
claude mcp add --transport http clickhouse-cloud https://mcp.clickhouse.cloud/mcp
```

Uses OAuth. Read-only. No env vars needed.

**Self-hosted MCP (any ClickHouse deployment):**

```bash
pip install mcp-clickhouse
```

| Variable | Example | Notes |

|----------|---------|-------|

| `CLICKHOUSE_HOST` | `abc123.clickhouse.cloud` | Hostname |

| `CLICKHOUSE_USER` | `default` | Database user |

| `CLICKHOUSE_PASSWORD` | `your-password` | Database password |

| `CLICKHOUSE_SECURE` | `true` | Always `true` for Cloud |

Enable writes: `export CLICKHOUSE_ALLOW_WRITE_ACCESS=true`

**Limitations:**

```bash
curl -s "https://abc123.clickhouse.cloud:8443/" \
  -H "X-ClickHouse-User: default" \
  -H "X-ClickHouse-Key: your-password" \
  --data-binary "SELECT name, engine FROM system.tables WHERE database = 'default' FORMAT JSON"
```

- MCP has ~200-500ms overhead per call. For large result sets or batch operations, use CLI.

- MCP's `list_tables` may not surface column `COMMENT` annotations — query `system.columns` directly for full schema context (see `agent-discovery-schema`).

**ClickHouse Cloud note:** Services can be idle/sleeping. The first query after inactivity may take 10-20 seconds while the service wakes up. A timeout or `503` on first connection is expected — retry once before treating it as an error.

Best for scripting, automation, and queries returning >10K rows. Zero per-call overhead.

If you have credentials but can't install `clickhouse-client` (lambda, sandbox, web-based agent), use the HTTP interface directly:

Port `8443` is HTTPS. Pass query settings as URL params: `?max_execution_time=30&max_result_rows=10000`.

1. Go to [console.clickhouse.cloud](https://console.clickhouse.cloud)

2. Click your service → **Connect** in the left sidebar

3. The dialog shows hostname, port, user, and a pre-built CLI command

4. **Reset password** if needed from the same dialog

For self-managed: check `config.xml` or ask your administrator.

Always specify a format. The default (TabSeparated without headers) is unparseable by agents.

| Format | Tokens (1K rows) | Best For |

|--------|------------------|----------|

| `JSON` | ~20K | Single queries — includes column types, row count, statistics |

| `JSONCompact` | ~10K | Same metadata as JSON but rows as arrays — good for wide tables |

| `JSONEachRow` | ~15K | Streaming large results, piping through `jq` |

| `TabSeparatedWithNames` | ~4K | Minimal tokens, simple tabular data |

Use `JSON` as the default for agent work. Switch to `TabSeparatedWithNames` when result sets are large and context window budget matters.

Reference: [https://github.com/ClickHouse/mcp-clickhouse](https://github.com/ClickHouse/mcp-clickhouse), [https://clickhouse.com/docs/interfaces/cli](https://clickhouse.com/docs/interfaces/cli), [https://clickhouse.com/docs/interfaces/formats](https://clickhouse.com/docs/interfaces/formats)

### 4.3 Count Recent Errors From system.error_log, Not system.errors

**Impact: MEDIUM-HIGH (system.errors is a since-restart counter; treating it as a time window, or differencing error_log, gives wrong error counts)**

`system.errors` holds one in-memory counter per error code **since the server started** (it resets on restart) plus the latest message and `last_error_time`. `system.error_log` stores `value` as the count **during one collection interval**, with a row written only for intervals where the count went up. To count errors in a window, `sum(value)` over `error_log` rows; never take differences between rows as you would for a cumulative counter.

Both tables also carry `remote`: when a distributed or `clusterAllReplicas` sub-query fails, the replica that raised the error records it with `remote = 0` and the initiator records it again with `remote = 1`, so summing both counts one failure twice.

**Incorrect: a since-restart counter read as "recent", or interval counts differenced**

```sql
-- Since-restart totals on one replica; a drop between reads means a restart.
SELECT name, value FROM system.errors ORDER BY value DESC LIMIT 10;

-- value is already per interval: deltas between rows discard real occurrences.
SELECT error, sum(greatest(value - prev, 0)) AS occurrences
FROM
(
    SELECT error, value,
        lagInFrame(value, 1, value) OVER (PARTITION BY hostname, code, remote ORDER BY event_time) AS prev
    FROM clusterAllReplicas('default', system.error_log)
    WHERE event_date >= toDate(now() - INTERVAL 6 HOUR) AND event_time >= now() - INTERVAL 6 HOUR
)
GROUP BY error;
```

**Correct: errors in the last N hours across replicas**

```sql
SELECT
    code,
    error,
    sum(value) AS occurrences,
    sumIf(value, remote = 0) AS raised_locally,
    max(event_time) AS last_seen
FROM clusterAllReplicas('default', system.error_log)
WHERE event_date >= toDate(now() - INTERVAL 6 HOUR)
  AND event_time >= now() - INTERVAL 6 HOUR
GROUP BY code, error
ORDER BY occurrences DESC
LIMIT 20
SETTINGS skip_unavailable_shards = 1;
```

**Errors are not failed queries.** Some error codes are raised and handled internally while the query still succeeds. For user-visible failures, count `exception_code != 0` in `query_log`. For bounding, replica coverage and other log-table reading rules, see [agent-system-tables-read-safely](agent-system-tables-read-safely.md).

Reference: [https://clickhouse.com/docs/reference/system-tables/error_log](https://clickhouse.com/docs/reference/system-tables/error_log), [https://clickhouse.com/docs/reference/system-tables/errors](https://clickhouse.com/docs/reference/system-tables/errors)

### 4.4 Discover Schema Before Querying

**Impact: CRITICAL (Skipping schema discovery leads to full scans, wrong columns, and wasted compute)**

ALWAYS start by understanding the schema. Never assume table or column names. Agents that skip schema discovery write queries that scan unnecessary data, use wrong column names, or miss the sort key — all of which burn compute and return bad results. The below queries are examples of how you access the schema for tables. Step 1 is a literal query. The rest are exemplars.

**Step 1: List databases**

**Step 2: List tables with size context**

This tells you which tables are large (and therefore expensive to scan carelessly) and what engine each uses.

**Step 3: Get columns, types, and comments**

**Column comments are critical.** If table creators have added `COMMENT` annotations to columns, they are invaluable for understanding semantics (e.g., distinguishing `user_id_hash` from `user_id`). MCP's `list_tables` tool returns column names and types but may not surface comments — always query `system.columns` directly when you need full context.

**Step 4: Understand the sort key**

This is the most important step for writing efficient queries. Filtering on sort key columns allows ClickHouse to skip entire data granules. Filtering on non-key columns forces a full scan.

**Step 5: Check for skipping indexes**

Skipping indexes (`bloom_filter`, `minmax`, `set`, `tokenbf_v1`) tell you which non-sort-key columns already have optimized filter paths. If an index exists on a column, filtering on it is efficient even though it's not in the sort key. Missing this step means you won't know which "non-key" filters are actually fast.

**Step 6: Sample data**

A small sample reveals actual data patterns — date ranges, enum values, null frequency — that inform how to write correct `WHERE` clauses.

**Step 7: Verify query plan before execution**

Before running a potentially expensive query, use `EXPLAIN` to verify it will use indexes efficiently:

Look for:

- **Keys** section showing your sort key columns are being used for filtering

- **Parts** and **Granules** counts — if these are not significantly reduced from the total, your filters aren't pruning effectively

- **Skip** entries showing data skipping index usage

For a quick cost estimate without running the query:

This returns estimated rows and bytes to be read — if the numbers look unreasonably large, refine your filters before executing.

**Example full discovery workflow:**

```sql
-- 1. What databases exist?
SELECT name FROM system.databases
WHERE name NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA');

-- 2. What's in the target database?
SELECT name, engine, total_rows,
       formatReadableSize(total_bytes) as size
FROM system.tables
WHERE database = 'analytics'
ORDER BY total_bytes DESC;

-- 3. What columns does the main table have? (comments reveal semantics)
SELECT name, type, comment
FROM system.columns
WHERE database = 'analytics' AND table = 'events'
ORDER BY position;

-- 4. What's the sort key? (determines efficient filter columns)
SELECT sorting_key, primary_key, partition_key
FROM system.tables
WHERE database = 'analytics' AND table = 'events';

-- 5. What skipping indexes exist? (optimized non-key filters)
SELECT name, type_full, expr, granularity
FROM system.data_skipping_indices
WHERE database = 'analytics' AND table = 'events';

-- 6. What does the data look like?
SELECT * FROM analytics.events LIMIT 5;

-- 7. Verify the query plan before running
EXPLAIN indexes = 1
SELECT event_type, count()
FROM analytics.events
WHERE event_date >= '2024-01-01'
  AND user_id = 'abc123'
GROUP BY event_type;

-- 8. NOW execute the query with confidence:
SELECT event_type, count()
FROM analytics.events
WHERE event_date >= '2024-01-01'  -- partition key filter
  AND user_id = 'abc123'          -- sort key filter
GROUP BY event_type
ORDER BY count() DESC
LIMIT 100;
```

**Why each step matters:**

| Step | Skipping It Causes |

|------|-------------------|

| List databases | Querying wrong or nonexistent database |

| List tables | Missing the right table, querying the wrong one |

| Get columns + comments | Wrong column names, misunderstood semantics |

| Check sort key | Full table scans instead of index-pruned reads |

| Check skip indexes | Missing optimized filter paths on non-key columns |

| Sample data | Wrong assumptions about date ranges, nulls, enums |

| Verify EXPLAIN | Expensive queries that could have been caught before execution |

Reference: [https://clickhouse.com/docs/operations/system-tables](https://clickhouse.com/docs/operations/system-tables)

### 4.5 Read System Log Tables as Bounded, Per-Replica Evidence

**Impact: HIGH (Unbounded or single-replica reads of query_log and other system logs give incomplete, double-counted, or misleading evidence)**

System log tables (`query_log`, `part_log`, `text_log`, `error_log`, `metric_log`, and others ending in `_log`) are ordinary local MergeTree tables written by each server. On ClickHouse Cloud each replica writes its own rows, so a plain `FROM system.query_log` shows only the replica your connection landed on. Read them through `clusterAllReplicas('default', system.<log>)` and keep `hostname` in the output. On self-managed clusters, use a cluster name from `system.clusters`; `default` may not exist. The generic limits in [agent-query-safety](agent-query-safety.md) still apply. This rule covers what is specific to reading system logs as evidence.

**Incorrect: one replica, unbounded, double counted, raw text copied out**

```sql
-- On Cloud this reads a single replica. It scans all retained history,
-- counts every query twice (QueryStart + QueryFinish rows) plus its
-- child queries, and returns raw query text that may contain customer data.
SELECT *
FROM system.query_log
WHERE query LIKE '%orders%'
ORDER BY query_duration_ms DESC
```

**Correct: check coverage first, then aggregate over a bounded window**

```sql
-- 1. What history does each replica still hold? Reads part metadata only.
SELECT
    hostname() AS replica,
    table,
    min(min_date) AS oldest_day,
    max(max_date) AS newest_day
FROM clusterAllReplicas('default', system.parts)
WHERE database = 'system' AND match(table, '^query_log(_[0-9]+)?$') AND active
GROUP BY replica, table
ORDER BY replica, table
SETTINGS skip_unavailable_shards = 1;

-- 2. Query shapes in the last 6 hours: one row per finished query.
SELECT
    normalized_query_hash,
    any(substring(normalizeQuery(query), 1, 120)) AS query_shape,
    count() AS runs,
    countIf(exception_code != 0) AS failed,
    quantile(0.5)(query_duration_ms) AS p50_ms,
    max(query_duration_ms) AS max_ms,
    formatReadableSize(max(memory_usage)) AS max_memory,
    sum(ProfileEvents['SelectedMarks']) AS marks_selected
FROM clusterAllReplicas('default', system.query_log)
WHERE event_date >= toDate(now() - INTERVAL 6 HOUR)
  AND event_time >= now() - INTERVAL 6 HOUR
  AND type != 'QueryStart'
  AND is_initial_query = 1
GROUP BY normalized_query_hash
ORDER BY runs DESC
LIMIT 20
SETTINGS skip_unavailable_shards = 1;
```

**Bounding and cost:**

- Filter on both `event_date` and `event_time`. The log tables are partitioned by `toYYYYMM(event_date)` and sorted by `(event_date, event_time)`, so the date predicate lets the query skip whole partitions and the time predicate trims within them. Check with `SELECT partition_key, sorting_key FROM system.tables WHERE database = 'system' AND name = 'query_log'`. Do not alias an expression as `event_date`, because the alias shadows the column.

- Select only the columns you need. `query_log` and `metric_log` are wide, and `SELECT *` reads every column.

- `skip_unavailable_shards = 1` stops one unreachable replica (for example, during scaling) from failing the query. The result then lacks that replica's rows, so compare the `hostname` values you got against the replicas you expected.

**`query_log` semantics:**

- A successful query writes a `QueryStart` row and a `QueryFinish` row. A query that fails while running writes `QueryStart` and `ExceptionWhileProcessing`. A query that fails before it starts (for example, a syntax error or an unknown table) writes only `ExceptionBeforeStart`. `type != 'QueryStart'` gives exactly one row per query. `type = 'QueryStart'` misses queries that failed before starting, and `QueryStart` rows have no duration or resource figures.

- Distributed and internal sub-queries get their own rows with `is_initial_query = 0`, often on other replicas, and they carry rewritten query text. Filter `is_initial_query = 1` for counts. To follow one request across replicas, filter `initial_query_id = '<id>'`.

- Group by `normalized_query_hash` (identical for queries that differ only in literals), not by `query` text. Filter failures with `exception_code != 0` and label them with `errorCodeToName(exception_code)`.

- `ProfileEvents` is a `Map`. Read `ProfileEvents['SelectedMarks']` and similar keys directly. A missing key returns 0, not NULL, so misspell a key and you silently get 0.

- The `query` and `exception` columns are raw text and can contain literal values such as customer identifiers or email addresses. Share `normalizeQuery(query)`, `normalized_query_hash` and `query_id` in tickets or chat. Leave raw text out unless you have redacted it.

**Other log tables:**

- `part_log.event_type` and `text_log.level` are `Enum8`. Compare them with the exact literal (`event_type = 'MergeParts'`). Enum comparisons follow the enum's numeric order, so `level <= 'Warning'` selects Fatal through Warning. A misspelled enum literal can return zero rows with no error (observed on 25.3), so an empty result can mean a typo. `part_log` also records `MergePartsStart` and `MutatePartStart` rows, which have no duration. Use `MergeParts` and `MutatePart` rows when you measure merges or mutations.

- A single failure can produce several `text_log` lines from different loggers. Count failures from `query_log` or `error_log`, and use `text_log` for the messages around a specific `query_id`.

**Absence is not evidence until coverage is checked:**

- Retention depends on each table's TTL, which the server config sets. Without a TTL the logs grow indefinitely (the self-managed default). Other deployments may keep a shorter window, so don't assume how far back the logs go. Read `SHOW CREATE TABLE system.query_log` and the coverage query above before concluding "this never happened". An empty result outside the retained window, or from a replica that was replaced or unreachable, proves nothing.

- After an upgrade that changes a log table's schema, ClickHouse renames the old table (`query_log_1`, `query_log_2`, ...). `merge('system', '^query_log')` reads all of them, but the columns may differ between them.

- `SYSTEM FLUSH LOGS` needs the `SYSTEM FLUSH LOGS` privilege. You only need it to see events from the last few seconds, which are still buffered in memory. Past events are already on disk, so you can wait out the flush interval instead.

Reference: [https://clickhouse.com/docs/reference/system-tables/overview#system-tables-in-clickhouse-cloud](https://clickhouse.com/docs/reference/system-tables/overview#system-tables-in-clickhouse-cloud), [https://clickhouse.com/docs/reference/system-tables/query_log](https://clickhouse.com/docs/reference/system-tables/query_log), [https://clickhouse.com/docs/guides/clickhouse/performance-and-monitoring/diagnose-slow-queries](https://clickhouse.com/docs/guides/clickhouse/performance-and-monitoring/diagnose-slow-queries), [https://clickhouse.com/docs/reference/system-tables/part_log](https://clickhouse.com/docs/reference/system-tables/part_log), [https://clickhouse.com/docs/reference/system-tables/text_log](https://clickhouse.com/docs/reference/system-tables/text_log)

---

## References

1. [https://clickhouse.com/docs](https://clickhouse.com/docs)
2. [https://github.com/ClickHouse/ClickHouse](https://github.com/ClickHouse/ClickHouse)
