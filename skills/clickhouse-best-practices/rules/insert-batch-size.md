---
title: Batch Inserts Appropriately (10K-100K rows)
impact: CRITICAL
impactDescription: "Each INSERT creates a part; single-row inserts overwhelm merge process"
tags: [insert, batching, parts, performance]
---

## Batch Inserts Appropriately (10K-100K rows)

**Impact: CRITICAL**

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
