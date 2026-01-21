# Sections

## 1. Schema Design (schema)

**Impact:** CRITICAL

**Description:** Proper schema design is foundational to ClickHouse performance. Column types, ordering, and nullable choices can impact query speed by orders of magnitude.

## 2. Query Optimization (query)

**Impact:** CRITICAL

**Description:** Query patterns dramatically affect performance. PREWHERE, join order, and aggregation strategies can reduce query time from minutes to milliseconds.

## 3. Table Engines (table)

**Impact:** HIGH

**Description:** Choosing the right table engine family determines data guarantees, deduplication behavior, and query performance characteristics.

## 4. Indexing Strategies (index)

**Impact:** HIGH

**Description:** Primary keys and secondary indexes (skip indexes, bloom filters) enable efficient data pruning and can reduce scanned data by 100×.

## 5. Materialized Views (materialized)

**Impact:** MEDIUM-HIGH

**Description:** Materialized views enable real-time aggregations and pre-computed queries, trading storage for query speed.

## 6. Distributed Operations (cluster)

**Impact:** MEDIUM

**Description:** Sharding and replication patterns affect data distribution, query parallelism, and fault tolerance.

## 7. Operations & Monitoring (ops)

**Impact:** MEDIUM

**Description:** Operational practices for monitoring, backups, mutations, and system table queries ensure database health.

## 8. Performance Tuning (performance)

**Impact:** LOW-MEDIUM

**Description:** Settings, compression codecs, memory limits, and buffer tuning for specific workloads.
