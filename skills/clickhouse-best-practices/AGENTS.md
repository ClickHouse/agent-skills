# ClickHouse Best Practices

**Version 0.5.0**
ClickHouse Inc  
September 2026
ClickHouse Version-dependent; verify features and settings on the target deployment

> **Note:**  
> This document is mainly for agents and LLMs to follow when designing,  
> optimizing, or maintaining ClickHouse databases. Humans may also find it  
> useful, but guidance here is optimized for automation and consistency by  
> AI-assisted workflows.

---

## Abstract

ClickHouse guidance for schema design, query optimization, ingestion, and bounded agent access. Read task-relevant rules and verify workload-dependent recommendations against query plans, measurements, and the deployed version.

---

## Table of Contents

1. [Schema Design](#1-schema-design) — **CRITICAL**
   - 1.1 [Avoid Nullable Unless Semantically Required](#11-avoid-nullable-unless-semantically-required)
   - 1.2 [Consider Starting Without Partitioning](#12-consider-starting-without-partitioning)
   - 1.3 [Filter on ORDER BY Columns in Queries](#13-filter-on-order-by-columns-in-queries)
   - 1.4 [Keep Partition Cardinality Bounded](#14-keep-partition-cardinality-bounded)
   - 1.5 [Minimize Bit-Width for Numeric Types](#15-minimize-bit-width-for-numeric-types)
   - 1.6 [Order Columns by Cardinality (Low to High)](#16-order-columns-by-cardinality-low-to-high)
   - 1.7 [Plan PRIMARY KEY Before Table Creation](#17-plan-primary-key-before-table-creation)
   - 1.8 [Prioritize Filter Columns in ORDER BY](#18-prioritize-filter-columns-in-order-by)
   - 1.9 [Understand Partition Query Performance Trade-offs](#19-understand-partition-query-performance-trade-offs)
   - 1.10 [Use Enum for Finite Value Sets](#110-use-enum-for-finite-value-sets)
   - 1.11 [Use JSON Type for Dynamic Schemas](#111-use-json-type-for-dynamic-schemas)
   - 1.12 [Use LowCardinality for Repeated Strings](#112-use-lowcardinality-for-repeated-strings)
   - 1.13 [Use Native Types Instead of String](#113-use-native-types-instead-of-string)
   - 1.14 [Use Partitioning for Data Lifecycle Management](#114-use-partitioning-for-data-lifecycle-management)
2. [Query Optimization](#2-query-optimization) — **CRITICAL**
   - 2.1 [Choose the Right JOIN Algorithm](#21-choose-the-right-join-algorithm)
   - 2.2 [Consider Alternatives to JOINs](#22-consider-alternatives-to-joins)
   - 2.3 [Filter Tables Before Joining](#23-filter-tables-before-joining)
   - 2.4 [Optimize NULL Handling in Outer JOINs](#24-optimize-null-handling-in-outer-joins)
   - 2.5 [Use ANY JOIN When Only One Match Needed](#25-use-any-join-when-only-one-match-needed)
   - 2.6 [Use Data Skipping Indices for Non-ORDER BY Filters](#26-use-data-skipping-indices-for-non-order-by-filters)
   - 2.7 [Use Incremental MVs for Real-Time Aggregations](#27-use-incremental-mvs-for-real-time-aggregations)
   - 2.8 [Use Refreshable MVs for Complex Joins and Batch Workflows](#28-use-refreshable-mvs-for-complex-joins-and-batch-workflows)
3. [Insert Strategy](#3-insert-strategy) — **CRITICAL**
   - 3.1 [Avoid ALTER TABLE DELETE](#31-avoid-alter-table-delete)
   - 3.2 [Avoid ALTER TABLE UPDATE](#32-avoid-alter-table-update)
   - 3.3 [Avoid OPTIMIZE TABLE FINAL](#33-avoid-optimize-table-final)
   - 3.4 [Batch Inserts Appropriately (10K-100K rows)](#34-batch-inserts-appropriately-10k-100k-rows)
   - 3.5 [Use Async Inserts for High-Frequency Small Batches](#35-use-async-inserts-for-high-frequency-small-batches)
   - 3.6 [Use Native Format for Best Insert Performance](#36-use-native-format-for-best-insert-performance)
4. [Agent Integration](#4-agent-integration) — **CRITICAL**
   - 4.1 [Bound Live Query Resource Use](#41-bound-live-query-resource-use)
   - 4.2 [Connect AI Agents to ClickHouse](#42-connect-ai-agents-to-clickhouse)
   - 4.3 [Discover Relevant Schema Before Querying](#43-discover-relevant-schema-before-querying)

---

## 1. Schema Design

**Impact: CRITICAL**

Proper schema design is foundational to ClickHouse performance. Changing existing physical ordering generally requires migration; constrained metadata-only sorting-key changes are possible. Includes primary key selection, data types, partitioning strategy, and JSON usage. Column types and ordering can impact query speed by orders of magnitude.

### 1.1 Avoid Nullable Unless Semantically Required

**Impact: HIGH (Nullable adds storage overhead; use DEFAULT values instead)**

Nullable columns maintain a separate UInt8 column for tracking null values, increasing storage and degrading performance. Use DEFAULT values only when they preserve the domain meaning. Unknown values must not silently become real values such as age zero or the current timestamp.

**Incorrect (Nullable everywhere):**

```sql
CREATE TABLE users (
    id Nullable(UInt64),              -- IDs should never be null
    name Nullable(String),            -- Empty string is fine
    age Nullable(UInt8),              -- Keep nullable if unknown differs from age zero
    login_count Nullable(UInt32)      -- 0 is a valid default
) ENGINE = Memory;
```

**Correct (DEFAULT values, Nullable only when semantic):**

```sql
CREATE TABLE users (
    id UInt64,                                    -- Never null
    name String DEFAULT '',                       -- Empty = unknown
    age Nullable(UInt8),                          -- Unknown differs from age zero
    login_count UInt32 DEFAULT 0,                 -- 0 = never logged in
    deleted_at Nullable(DateTime),                -- NULL = not deleted (semantic!)
    parent_id Nullable(UInt64)                    -- NULL = no parent (semantic!)
) ENGINE = Memory;
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
| DateTime | A domain-approved default; retain NULL for unknown timestamps |
| UUID | Generate only for a new identity; retain NULL for an unknown identity |

Reference: [Select Data Types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.2 Consider Starting Without Partitioning

**Impact: MEDIUM (Add partitioning later when you have clear lifecycle requirements)**

Start without partitioning and add it later only if:
- You have clear data lifecycle requirements (retention, archiving)
- Your access patterns clearly benefit from partition pruning
- You understand the cardinality implications

**Example (start simple):**

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

Reference: [Choosing a Partitioning Key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)

### 1.3 Filter on ORDER BY Columns in Queries

**Impact: CRITICAL (Leading-key filters often prune best; verify later-key filters with EXPLAIN)**

Leading primary-key filters often provide the strongest granule pruning. Later-key filters can still use the sparse index, with effectiveness depending on earlier-key cardinality and data distribution. Filters outside the primary key may benefit from partition pruning, skipping indexes, or projections. Use EXPLAIN to check the actual plan; do not add predicates that change the requested result just to match a key.

**Example (filters needing plan inspection):**

```sql
-- Given: ORDER BY (tenant_id, event_type, timestamp)

-- Later-key filter: inspect whether it prunes enough granules
SELECT * FROM events WHERE event_type = 'click';

-- Non-key filter: inspect other indexes and scan volume
SELECT * FROM events WHERE user_agent LIKE '%Chrome%';
```

**Example (when tenant-scoped results are requested):**

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
| `WHERE event_type = 'click'` | Possible; distribution-dependent |
| `WHERE timestamp > '2024-01-01'` | Possible; distribution-dependent |

Reference: [Choosing a Primary Key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)

### 1.4 Keep Partition Cardinality Bounded

**Impact: HIGH (Too many partitions cause part explosion and 'too many parts' errors)**

Choose partition granularity from retention, insert volume, and part size; 100–1,000 is a rough upper-range heuristic, not a minimum or target. Too many distinct partition values create excessive data parts, eventually triggering "too many parts" errors. ClickHouse enforces limits via `max_parts_in_total` and `parts_to_throw_insert` settings.

**Incorrect (high cardinality partitioning):**

```sql
-- High cardinality = too many partitions
CREATE TABLE events (timestamp DateTime, user_id UInt64)
ENGINE = MergeTree()
PARTITION BY user_id  -- Millions of partitions!
ORDER BY (timestamp);

-- Daily partitions can grow unbounded over years
CREATE TABLE logs (timestamp DateTime, service String)
ENGINE = MergeTree()
PARTITION BY toDate(timestamp)  -- 3650 partitions over 10 years
ORDER BY (service, timestamp);
```

**Correct (bounded cardinality):**

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

-- Investigate many small parts and partitions relative to retention and volume
```

Reference: [Choosing a Partitioning Key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)

### 1.5 Minimize Bit-Width for Numeric Types

**Impact: HIGH (Smaller types reduce storage and improve cache efficiency)**

Select the smallest numeric type that accommodates your data range. Prefer unsigned types when negative values aren't needed.

**Incorrect (oversized types):**

```sql
CREATE TABLE metrics (
    status_code Int64,        -- HTTP codes are 100-599
    age Int64,                -- Human age fits in UInt8
    year Int64,               -- Years fit in UInt16
    item_count Int64          -- Often small numbers
) ENGINE = Memory;
```

**Correct (right-sized types):**

```sql
CREATE TABLE metrics (
    status_code UInt16,       -- 0-65,535 (HTTP codes fit easily)
    age UInt8,                -- 0-255 (sufficient for age)
    year UInt16,              -- 0-65,535 (sufficient for years)
    item_count UInt32         -- 0-4 billion (adjust based on actual max)
) ENGINE = Memory;
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

Reference: [Select Data Types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.6 Order Columns by Cardinality (Low to High)

**Impact: CRITICAL (Key order affects pruning and compression; choose useful filter columns first)**

Since the sparse primary index operates on data blocks (granules) rather than individual rows, low-cardinality leading columns create more useful index entries that can skip entire blocks. Among columns useful to the workload, lower-cardinality columns often work well earlier. A high-cardinality leading key is appropriate for selective lookups on that key; cardinality alone does not determine pruning.

**Incorrect (high cardinality first):**

```sql
-- Poor fit when the workload filters event_type/time rather than event_id
CREATE TABLE events (event_id UUID, event_type LowCardinality(String), timestamp DateTime, event_date Date DEFAULT toDate(timestamp))
ENGINE = MergeTree()
ORDER BY (event_id, event_type, timestamp);
-- event_id lookups can prune well, but event_type/time filters may prune poorly
```

**Correct (low cardinality first):**

```sql
-- Low cardinality first enables pruning
CREATE TABLE events (event_id UUID, event_type LowCardinality(String), timestamp DateTime, event_date Date DEFAULT toDate(timestamp))
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

Reference: [Choosing a Primary Key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)

### 1.7 Plan PRIMARY KEY Before Table Creation

**Impact: CRITICAL (Changing physical ordering generally requires a new table and data migration)**

ORDER BY defines physical ordering; PRIMARY KEY defines the sparse index and defaults to ORDER BY when not specified separately. Plan both around the workload. Reordering existing data generally requires a new table and migration. `ALTER TABLE ... MODIFY ORDER BY` supports constrained metadata-only changes; it does not re-sort existing parts or change the primary key.

**Incorrect (arbitrary ORDER BY without query analysis):**

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
-- Existing user_id/timestamp cannot simply replace the current physical order
```

**Correct (query-driven ORDER BY selection):**

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
- [ ] Identified the important query patterns
- [ ] Identified columns in WHERE clauses with frequency
- [ ] Prioritized columns that exclude large numbers of rows
- [ ] Used cardinality to refine the order among useful filter columns
- [ ] Limited to 4-5 key columns (typically sufficient)

References: [Choosing a Primary Key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key) · [MODIFY ORDER BY](https://clickhouse.com/docs/sql-reference/statements/alter/order-by)

### 1.8 Prioritize Filter Columns in ORDER BY

**Impact: CRITICAL (Align primary keys with important filters to reduce scanned granules)**

Prioritize columns frequently used in query filters (WHERE clause), especially those that exclude large numbers of rows. Filters outside the primary key may still use partition pruning, skipping indexes, or projections; inspect the actual plan.

**Incorrect (ORDER BY doesn't match query patterns):**

```sql
-- If most queries filter by tenant_id:
CREATE TABLE events (event_id UUID, tenant_id UInt64, event_date Date)
ENGINE = MergeTree()
ORDER BY (event_id);  -- Queries by tenant_id will full-scan!
```

**Correct (ORDER BY matches filter patterns):**

```sql
-- ORDER BY matches query filter patterns
CREATE TABLE events (event_id UUID, tenant_id UInt64, event_date Date)
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

Reference: [Choosing a Primary Key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)

### 1.9 Understand Partition Query Performance Trade-offs

**Impact: MEDIUM (Partition pruning helps some queries; spanning many partitions hurts others)**

Preserve the requested time range: adding a time filter changes the answer. Partitioning can help or hurt query performance:
- **Potential improvement**: Queries filtering by partition key may benefit from partition pruning
- **Potential degradation**: Queries spanning many partitions increase total parts scanned

ClickHouse automatically builds **MinMax indexes** on partition columns. Data merges occur **within partitions only**, not across them.

**Example (all-time count, no partition pruning):**

```sql
-- Query must scan all partitions
SELECT count(*) FROM events
WHERE event_type = 'click';  -- No partition pruning
```

**Example (when the user requests a January-only count):**

```sql
-- Query prunes to single partition
SELECT count(*) FROM events
WHERE timestamp >= '2024-01-01' AND timestamp < '2024-02-01'
  AND event_type = 'click';
```

Reference: [Choosing a Partitioning Key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)

### 1.10 Use Enum for Finite Value Sets

**Impact: MEDIUM (Insert-time validation and natural ordering; 1-2 bytes storage)**

Enum types provide validation at insert time and enable queries that exploit natural ordering. Use Enum8 (up to 256 values) or Enum16 (up to 65,536 values).

**Incorrect (String without validation):**

```sql
CREATE TABLE orders (
    status String    -- No validation, typos like "shiped" allowed
) ENGINE = Memory;

-- Ordering requires CASE statements
SELECT * FROM orders ORDER BY
    CASE status
        WHEN 'pending' THEN 1
        WHEN 'processing' THEN 2
        WHEN 'shipped' THEN 3
    END;
```

**Correct (Enum with validation and ordering):**

```sql
CREATE TABLE orders (
    status Enum8('pending' = 1, 'processing' = 2, 'shipped' = 3, 'delivered' = 4)
) ENGINE = Memory;

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

Reference: [Select Data Types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.11 Use JSON Type for Dynamic Schemas

**Impact: MEDIUM (Field-level querying for semi-structured data; use typed columns for known schemas)**

ClickHouse's JSON type splits JSON objects into separate sub-columns, enabling field-level query optimization. Use it for truly dynamic data, not everything.

**Incorrect (schema bloat or opaque String):**

```sql
-- BAD: Hundreds of nullable columns for event properties
CREATE TABLE events (
    event_id UUID,
    prop_page_url Nullable(String),
    prop_button_id Nullable(String)
    -- ... 100 more nullable columns
) ENGINE = Memory;

-- BAD: JSON as String when you need field queries
CREATE TABLE events (
    event_id UUID,
    properties String  -- No field-level optimization
) ENGINE = Memory;
```

**Correct (JSON for dynamic, typed for known):**

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

| Scenario | Use JSON? |
|----------|-----------|
| Data structure varies unpredictably | Yes |
| Field types/schemas change over time | Yes |
| Need field-level querying | Yes |
| Fixed, known schema | No (use typed columns) |
| JSON as opaque blob (no field queries) | No (use String) |

**Optimization: specify types for known paths:**

```sql
CREATE TABLE events (
    properties JSON(
        url String,
        amount Float64,
        product_id UInt64
    )
) ENGINE = Memory;
```

Reference: [Use JSON Where Appropriate](https://clickhouse.com/docs/best-practices/use-json-where-appropriate)

### 1.12 Use LowCardinality for Repeated Strings

**Impact: HIGH (Dictionary encoding for <10K unique values; significant storage reduction)**

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

### 1.13 Use Native Types Instead of String

**Impact: CRITICAL (2-10x storage reduction; enables compression and correct semantics)**

Using String for all data wastes storage, prevents compression optimization, and makes comparisons slower. ClickHouse's column-oriented architecture benefits directly from optimal type selection.

**Incorrect (String for everything):**

```sql
CREATE TABLE events (
    event_id String,        -- "550e8400-e29b-41d4-a716-446655440000" = 36 bytes
    user_id String,         -- "12345" = 5 bytes (no numeric operations)
    created_at String,      -- "2024-01-15 10:30:00" = 19 bytes
    count String,           -- "42" - can't do math!
    is_active String        -- "true" = 4 bytes
) ENGINE = Memory;
```

**Correct (native types):**

```sql
CREATE TABLE events (
    event_id UUID DEFAULT generateUUIDv4(),     -- 16 bytes (vs 36)
    user_id UInt64,                              -- 8 bytes, numeric ops
    created_at DateTime DEFAULT now(),           -- 4 bytes (vs 19)
    count UInt32 DEFAULT 0,                      -- 4 bytes, math works
    is_active Bool DEFAULT true                  -- 1 byte (vs 4)
) ENGINE = Memory;
```

**Type Selection Quick Reference:**

| Data | Use | Avoid |
|------|-----|-------|
| Sequential IDs | UInt32/UInt64 | String |
| UUIDs | UUID | String |
| Status/Category | Enum8 or LowCardinality(String) | String |
| Timestamps | DateTime for seconds; DateTime64 for subsecond precision/range | String when time operations are needed |
| Dates only | Date or Date32 | DateTime, String |
| Counts | UInt8/16/32 (smallest that fits) | Int64, String |
| Money | Decimal(P,S) or Int64 (cents) | Float64, String |
| Booleans | Bool or UInt8 | String |

Reference: [Select Data Types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.14 Use Partitioning for Data Lifecycle Management

**Impact: HIGH (DROP PARTITION is instant; DELETE is expensive row-by-row scan)**

Partitioning is **primarily a data management technique, not a query optimization tool**. It excels at:
- **Dropping data**: Remove entire partitions as single metadata operations
- **TTL retention**: Implement time-based retention policies efficiently
- **Tiered storage**: Move old partitions to cold storage
- **Archiving**: Move partitions between tables

**Incorrect (no time alignment for lifecycle):**

```sql
-- Cannot efficiently drop old data by time
CREATE TABLE events (timestamp DateTime, event_type LowCardinality(String))
ENGINE = MergeTree()
PARTITION BY event_type  -- No time alignment
ORDER BY (timestamp);

-- Slow: must scan and delete row by row
DELETE FROM events WHERE timestamp < '2023-01-01';
```

**Correct (time-based for lifecycle):**

```sql
CREATE TABLE events (
    timestamp DateTime,
    event_type LowCardinality(String)
)
ENGINE = MergeTree()
PARTITION BY toStartOfMonth(timestamp)
ORDER BY (event_type, timestamp)
TTL timestamp + INTERVAL 1 YEAR DELETE;  -- Expiration is applied during merges

-- Fast: metadata-only operation
ALTER TABLE events DROP PARTITION '2023-01-01';

-- Archive to cold storage
ALTER TABLE events_archive ATTACH PARTITION '2023-01-01' FROM events;
```

Reference: [Choosing a Partitioning Key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)

---

## 2. Query Optimization

**Impact: CRITICAL**

Query patterns dramatically affect performance. JOIN algorithms, filtering strategies, skipping indices, and materialized views can reduce query time from minutes to milliseconds. Pre-computed aggregations read thousands of rows instead of billions.

### 2.1 Choose the Right JOIN Algorithm

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

Reference: [Minimize and Optimize JOINs](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.2 Consider Alternatives to JOINs

**Impact: CRITICAL (Dictionaries and denormalization shift work from query time to insert time)**

Repeated JOINs to dimension tables add overhead. Dictionaries or denormalization shift computational work from query time to insert/pre-processing time.

**Incorrect (JOIN on every query):**

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

Reference: [Minimize and Optimize JOINs](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.3 Filter Tables Before Joining

**Impact: CRITICAL (Joining full tables then filtering wastes resources)**

Joining full tables then filtering wastes resources. Add filtering in `WHERE` or `JOIN ON` clauses. If automatic pushdown fails, restructure as a subquery.

**Example (let the optimizer push down filters):**

```sql
-- WHERE syntax does not imply that filtering happens after the JOIN
SELECT o.order_id, c.name, o.total
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at > '2024-01-01' AND c.country = 'US';
```

**Example (rewrite if EXPLAIN shows pushdown is missing):**

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

**Example (aggregate first when the requested result is revenue by customer):**

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

Reference: [Minimize and Optimize JOINs](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.4 Optimize NULL Handling in Outer JOINs

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

Reference: [Minimize and Optimize JOINs](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.5 Use ANY JOIN When Only One Match Needed

**Impact: HIGH (Returns first match only; less memory and faster execution)**

Use `ANY` JOINs when you only need a single match rather than all matches. They consume less memory and execute faster.

**Incorrect (returns all matches):**

```sql
-- Returns all matching rows, uses more memory
SELECT o.order_id, c.name
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id;
```

**Correct (returns first match only):**

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

Reference: [Minimize and Optimize JOINs](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.6 Use Data Skipping Indices for Non-ORDER BY Filters

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
| `ngrambf_v1` | Text search | `WHERE text LIKE '%term%'` |
| `tokenbf_v1` | Token search | `WHERE hasToken(text, 'word')` |

**Validation:**

```sql
EXPLAIN indexes = 1
SELECT * FROM events WHERE user_id = 12345;
-- Look for "Skip" in output showing granules skipped
```

Reference: [Use Data Skipping Indices Where Appropriate](https://clickhouse.com/docs/best-practices/use-data-skipping-indices-where-appropriate)

### 2.7 Use Incremental MVs for Real-Time Aggregations

**Impact: HIGH (Read thousands of rows instead of billions; insert-time work depends on the view and workload)**

Incremental MVs automatically apply the view's query to new data blocks at insert time. Results are written to a target table and partial results merge over time.

**Incorrect (full aggregation on every query):**

```sql
-- Full aggregation on every dashboard load
SELECT
    event_type,
    toStartOfHour(timestamp) as hour,
    count() as events,
    uniq(user_id) as unique_users
FROM events
WHERE timestamp >= toStartOfHour(now()) - INTERVAL 7 DAY
GROUP BY event_type, hour;
-- Scans 7 days of data every time (billions of rows)
```

**Correct (incremental MV with pre-aggregation):**

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
WHERE hour >= toStartOfHour(now()) - INTERVAL 7 DAY
GROUP BY event_type, hour;
-- Reads thousands of rows instead of billions
```

**Key points:**
- Use `-State` functions in MV, `-Merge` functions in query
- Incremental - existing data not automatically included (backfill separately)
- Measure insert overhead and target size. The example compares complete hour buckets; exact partial-hour windows require retaining finer-grained data.

Reference: [Use Materialized Views](https://clickhouse.com/docs/best-practices/use-materialized-views)

### 2.8 Use Refreshable MVs for Complex Joins and Batch Workflows

**Impact: HIGH (Sub-millisecond queries with periodic refresh; ideal for complex joins)**

Refreshable MVs execute queries periodically on a schedule. The full query re-executes and overwrites (or appends to) the target table.

**Best for:**
- Sub-millisecond latency where minor staleness is acceptable
- Caching "top N" results or lookup tables
- Complex multi-table joins requiring denormalization
- Batch workflows and DAG dependencies

**Incorrect (expensive join on every request):**

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

**Correct (refreshable MV):**

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

Reference: [Use Materialized Views](https://clickhouse.com/docs/best-practices/use-materialized-views)

---

## 3. Insert Strategy

**Impact: CRITICAL**

Synchronous inserts create parts, potentially across multiple partitions. Frequent small synchronous inserts can overwhelm merges. Proper batching (10K-100K rows), async inserts for high-frequency writes, mutation avoidance, and letting background merges work are essential for stable cluster performance.

### 3.1 Avoid ALTER TABLE DELETE

**Impact: CRITICAL (Use lightweight DELETE, CollapsingMergeTree, or DROP PARTITION instead)**

`ALTER TABLE DELETE` is a mutation that rewrites entire data parts. Use alternatives like lightweight DELETE, CollapsingMergeTree, or DROP PARTITION.

**Incorrect (mutation delete):**

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

Reference: [Avoid Mutations](https://clickhouse.com/docs/best-practices/avoid-mutations)

### 3.2 Avoid ALTER TABLE UPDATE

**Impact: CRITICAL (Use lightweight UPDATE or ReplacingMergeTree instead)**

`ALTER TABLE UPDATE` is a mutation that rewrites entire data parts affected by the change. Use alternatives like lightweight UPDATE or ReplacingMergeTree.

**Why mutations are problematic:**
- **Write amplification:** Rewrite complete parts even for minor changes
- **Disk I/O spike:** Degrades overall cluster performance
- **No rollback:** Cannot be rolled back after submission
- **Inconsistent reads:** SELECT may read mix of mutated and unmutated parts

**Incorrect (mutation update):**

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

Reference: [Avoid Mutations](https://clickhouse.com/docs/best-practices/avoid-mutations)

### 3.3 Avoid OPTIMIZE TABLE FINAL

**Impact: HIGH (Forces expensive merge of all parts; let background merges work)**

`OPTIMIZE TABLE ... FINAL` forces immediate merge of all parts into one part per partition. This is resource-intensive and rarely necessary. ClickHouse already performs smart background merges.

**Note:** `OPTIMIZE FINAL` is not the same as `FINAL`. The `FINAL` modifier in SELECT queries may be necessary for deduplicated results in ReplacingMergeTree and is generally fine to use.

**Incorrect (OPTIMIZE FINAL after inserts):**

```sql
-- Running OPTIMIZE FINAL after every batch insert
INSERT INTO events SELECT * FROM staging_events;
OPTIMIZE TABLE events FINAL;  -- Expensive and unnecessary!

-- Scheduled OPTIMIZE FINAL jobs
-- Cron: 0 * * * * clickhouse-client -q "OPTIMIZE TABLE events FINAL"
```

**Correct (let background merges work):**

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

Reference: [Avoid OPTIMIZE FINAL](https://clickhouse.com/docs/best-practices/avoid-optimize-final)

### 3.4 Batch Inserts Appropriately (10K-100K rows)

**Impact: CRITICAL (Each INSERT creates a part; single-row inserts overwhelm merge process)**

Synchronous inserts into MergeTree create parts, potentially several when a batch spans partitions. Async inserts buffer requests before creating parts. Single-row or small-batch inserts create thousands of tiny parts, overwhelming the merge process and causing cluster instability.

**Incorrect (single-row or tiny batches):**

```python
# Single-row inserts - creates 10,000 parts!
for event in events:
    client.execute("INSERT INTO events VALUES", [event])

# Tiny batches - still too many parts
for batch in chunks(events, 100):  # 100 rows per INSERT
    client.execute("INSERT INTO events VALUES", batch)
```

**Correct (proper batch size):**

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
-- Compare part counts with the deployment settings; thresholds vary
SELECT table, partition, count() as parts, sum(rows) as total_rows
FROM system.parts
WHERE active AND database = 'default'
GROUP BY table, partition
ORDER BY parts DESC;
```

Reference: [Selecting an Insert Strategy](https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy)

### 3.5 Use Async Inserts for High-Frequency Small Batches

**Impact: HIGH (Server-side buffering when client batching isn't practical)**

When client-side batching isn't practical, async inserts buffer server-side and create larger parts automatically.

**Incorrect (small batches without async):**

```python
# Small batches without async_insert - creates too many parts
for batch in chunks(events, 100):
    client.execute("INSERT INTO events VALUES", batch)
```

**Correct (enable async inserts):**

```python
# Enable async_insert with safe defaults
client.execute("SET async_insert = 1")
client.execute("SET wait_for_async_insert = 1")  # Confirms durability

for batch in chunks(events, 100):
    client.execute("INSERT INTO events VALUES", batch)
# Server buffers and creates larger parts automatically
```

```sql
-- Configure server-side for specific users
ALTER USER my_app_user SETTINGS
    async_insert = 1,
    wait_for_async_insert = 1,
    async_insert_max_data_size = 10000000,  -- Flush at 10MB
    async_insert_busy_timeout_ms = 1000;    -- Flush after 1s
```

**Flush conditions (whichever occurs first):**
- Buffer reaches `async_insert_max_data_size`
- Time threshold `async_insert_busy_timeout_ms` elapses
- Maximum insert queries accumulate

**Return modes:**

| Setting | Behavior | Use Case |
|---------|----------|----------|
| `wait_for_async_insert=1` | Waits for flush, confirms durability | **Recommended** |
| `wait_for_async_insert=0` | Fire-and-forget, unaware of errors | **Risky** - only if you accept data loss |

Reference: [Selecting an Insert Strategy](https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy)

### 3.6 Use Native Format for Best Insert Performance

**Impact: MEDIUM (Native format is most efficient; JSONEachRow is expensive to parse)**

Data format affects insert performance. Native format is column-oriented with minimal parsing overhead.

**Performance Ranking (fastest to slowest):**

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

Reference: [Selecting an Insert Strategy](https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy)

---

## 4. Agent Integration

**Impact: CRITICAL**

AI agents working with ClickHouse need deliberate connection setup, schema discovery, and safe query execution. Use supplied metadata or discover what the task is missing; inspect plans and resource budgets for unfamiliar or expensive queries. Covers MCP/CLI/HTTP connectivity and credential handling, task-relevant metadata discovery and plan inspection, and resource controls such as `max_execution_time` and plan estimates; bound previews without changing requested result semantics.

### 4.1 Bound Live Query Resource Use

**Impact: CRITICAL (Result limits alone do not bound scans, aggregation memory, or execution time)**

For live exploration, use the deployment's approved execution, scan, memory, and result limits. Reuse enforced settings profiles; add per-query limits where needed. Choose budgets for the service and task rather than assuming one safe scan size for every cluster.

A LIMIT bounds returned rows, not necessarily scanned rows or aggregation work. A scalar aggregate does not need an artificial LIMIT. Preserve the requested result: a partition-key predicate is useful only if it is consistent with the question.

**Incorrect (assuming LIMIT makes a full aggregation cheap):**

```sql
SELECT user_id, count()
FROM events
GROUP BY user_id
ORDER BY count() DESC
LIMIT 10;
```

**Correct (bounded exploration with an explicitly requested time range):**

```sql
-- Illustrative budgets: adapt to the approved service limits.
SELECT user_id, count()
FROM events
WHERE event_date = today()
GROUP BY user_id
ORDER BY count() DESC
LIMIT 10
SETTINGS max_execution_time = 30,
         max_rows_to_read = 1000000,
         max_memory_usage = 1000000000,
         read_overflow_mode = 'throw',
         timeout_overflow_mode = 'throw';
```

**Limits and completeness:**

- Use EXPLAIN for potentially expensive plans. A count query is not automatically a cheap preflight.
- Check the effective settings on the target service; Cloud and self-managed profiles can differ.
- Prefer an error on budget exhaustion when a complete answer is required. Overflow modes that return partial results must be disclosed; never present a truncated aggregate as complete.
- Limits are checked during execution and can overshoot; they are not precise wall-clock or billing guarantees.
- Use bounded result samples for exploration. Exports may require streaming the full requested result rather than adding LIMIT.

**Recovery:**

On a timeout or memory error, inspect the cause and plan before retrying. Use an equivalent optimization, an explicitly agreed narrower scope, or a justified budget change within existing authorization. Do not silently narrow dates or increase limits. Stop repeated attempts that reproduce the same failure without new evidence.

Production access should use appropriately constrained database users, settings profiles, and quotas so resource limits do not depend on the model remembering every setting. Changing those controls is a separate administrative action, not part of answering a query.

Reference: [Query complexity restrictions](https://clickhouse.com/docs/operations/settings/query-complexity) · [Settings profiles](https://clickhouse.com/docs/operations/settings/settings-profiles) · [Quotas](https://clickhouse.com/docs/operations/quotas)

### 4.2 Connect AI Agents to ClickHouse

**Impact: HIGH (Proper connection setup eliminates credential-prompting friction and enables structured access)**

Use an existing authorized MCP, CLI, or HTTP connection when live access is needed. Reuse configured credentials without displaying secrets. Offline review does not need a connection; configuring new integrations or enabling writes is only appropriate when the task calls for it.

**Incorrect (prompting for credentials every time):**

```python
# Agent asks the user for host, port, user, password on every session
# Credentials are hardcoded in the prompt or conversation
response = client.query("SELECT 1",
    host="???", user="???", password="???")  # fragile, unsecured
```

**Correct (MCP or CLI with pre-configured credentials):**

```bash
# MCP: credentials configured once via env vars or OAuth
claude mcp add --transport http clickhouse-cloud https://mcp.clickhouse.cloud/mcp

# CLI: credentials in a named profile or env vars
clickhouse client --host abc123.clickhouse.cloud --port 9440 --secure \
  --user default --password "$CLICKHOUSE_PASSWORD" --format JSON \
  --query "SELECT 1"
```

### Option A: MCP Server (interactive agent workflows)

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

Keep read-only access for analysis. If a requested write requires enabling access, first verify that the user authorized that operation; a connection setup example is not permission to enable writes.

**Limitations:**
- For large result sets or batch operations, consider CLI/HTTP streaming and the available tool limits.
- MCP's `list_tables` may not surface column `COMMENT` annotations — query `system.columns` directly for full schema context (see `agent-discovery-schema`).

**ClickHouse Cloud note:** Services can be idle/sleeping. The first query after inactivity may take 10-20 seconds while the service wakes up. An initial timeout or `503` may indicate wake-up; a bounded retry of a read can be appropriate. Diagnose persistent errors rather than assuming wake-up.

### Option B: clickhouse-client (batch operations, large results)

Best for scripting, automation, and queries returning >10K rows. Choose based on the installed tools and output needs.

```bash
clickhouse client \
  --host abc123.clickhouse.cloud --port 9440 --secure \
  --user default --password "$CLICKHOUSE_PASSWORD" \
  --format JSON \
  --max_execution_time 30 \
  --query "SELECT * FROM events LIMIT 100" 2>&1
```

### Option C: HTTP interface (fallback when CLI is unavailable)

If you have credentials but can't install `clickhouse-client` (lambda, sandbox, web-based agent), use the HTTP interface directly:

```bash
curl -s "https://abc123.clickhouse.cloud:8443/" \
  -H "X-ClickHouse-User: default" \
  -H "X-ClickHouse-Key: your-password" \
  --data-binary "SELECT name, engine FROM system.tables WHERE database = 'default' FORMAT JSON"
```

Port `8443` is HTTPS. Pass query settings as URL params: `?max_execution_time=30&max_result_rows=10000`.

### Where to find connection credentials (ClickHouse Cloud)

1. Go to [console.clickhouse.cloud](https://console.clickhouse.cloud)
2. Click your service → **Connect** in the left sidebar
3. The dialog shows hostname, port, user, and a pre-built CLI command
4. If credentials are unavailable, request the missing access. Resetting a password may affect other clients and requires specific authorization.

For self-managed: check `config.xml` or ask your administrator.

### Output format selection

Select an explicit format that the consumer can parse. Headerless tab-separated output requires separate column context.

| Format | Best For |
|--------|----------|
| `JSON` | Column metadata, row count, and statistics |
| `JSONCompact` | Similar metadata with rows as arrays |
| `JSONEachRow` | Streaming and line-oriented consumers |
| `TabSeparatedWithNames` | Compact tabular results with column names |

Use `JSON` as the default for agent work. Switch to `TabSeparatedWithNames` when result sets are large and context window budget matters.

Reference: [ClickHouse MCP Server](https://github.com/ClickHouse/mcp-clickhouse) · [clickhouse-client](https://clickhouse.com/docs/interfaces/cli) · [Output Formats](https://clickhouse.com/docs/interfaces/formats)

### 4.3 Discover Relevant Schema Before Querying

**Impact: CRITICAL (Use verified metadata to avoid wrong columns, misunderstood semantics, and unnecessary scans)**

Use schema supplied by the user, reliable session evidence, or target-database metadata. Retrieve what is missing for the task; there is no mandatory discovery sequence. A question about supplied SQL need not establish a live connection, and a known table need not trigger a database-wide inventory.

**Incorrect (guessing unknown columns):**

```sql
-- Assuming a timestamp column exists without checking the supplied schema
SELECT timestamp FROM analytics.events LIMIT 5;
```

**Correct (inspect the relevant table when its schema is unknown):**

```sql
SELECT name, type, comment
FROM system.columns
WHERE database = 'analytics' AND table = 'events'
ORDER BY position;

SELECT engine, sorting_key, primary_key, partition_key
FROM system.tables
WHERE database = 'analytics' AND name = 'events';
```

Comments help distinguish similarly named identifiers and units. Use SHOW CREATE TABLE when engine arguments, projections, defaults, or full DDL matter. Tools may already return this information; do not repeat equivalent calls.

**Example (find a table when the target is unknown):**

```sql
SELECT database, name, engine, total_rows, total_bytes
FROM system.tables
WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
ORDER BY total_bytes DESC
LIMIT 100;
```

**Example (inspect skipping indexes for a performance question):**

```sql
SELECT name, type_full, expr, granularity
FROM system.data_skipping_indices
WHERE database = 'analytics' AND table = 'events';
```

An index's presence does not prove a filter is selective. Inspect its use and granules pruned with EXPLAIN. Use a small, bounded sample only when values are needed to resolve semantics; five rows cannot establish overall cardinality, date range, or null frequency.

**Example (inspect a potentially expensive query before executing):**

```sql
EXPLAIN indexes = 1
SELECT event_type, count()
FROM analytics.events
WHERE event_date >= '2024-01-01' AND user_id = 'abc123'
GROUP BY event_type;
```

Adapt identifiers and literal types to the verified schema. Inspect parts and granules selected, primary-key conditions, skipping indexes, and projections. Later-key filters may still prune; non-key filters may benefit from other access paths. If the plan is expensive, propose an equivalent optimization or discuss a narrower question rather than silently changing the result scope.

Reference: [System Tables](https://clickhouse.com/docs/operations/system-tables) · [EXPLAIN](https://clickhouse.com/docs/sql-reference/statements/explain)

---

## References

1. [https://clickhouse.com/docs](https://clickhouse.com/docs)
2. [https://github.com/ClickHouse/ClickHouse](https://github.com/ClickHouse/ClickHouse)
