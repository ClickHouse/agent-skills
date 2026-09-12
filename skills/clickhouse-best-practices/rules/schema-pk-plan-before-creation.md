---
title: Plan PRIMARY KEY Before Table Creation
impact: CRITICAL
impactDescription: "Changing physical ordering generally requires a new table and data migration"
tags: [schema, primary-key, ORDER BY]
---

## Plan PRIMARY KEY Before Table Creation

**Impact: CRITICAL**

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
