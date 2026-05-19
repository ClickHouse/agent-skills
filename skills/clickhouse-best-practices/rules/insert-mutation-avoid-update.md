---
title: Avoid ALTER TABLE UPDATE
impact: CRITICAL
impactDescription: "Use lightweight UPDATE or ReplacingMergeTree instead"
tags: [insert, mutation, UPDATE, ReplacingMergeTree]
---

## Avoid ALTER TABLE UPDATE

**Impact: CRITICAL**

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
