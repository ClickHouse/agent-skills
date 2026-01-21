---
title: Rule Title Here
impact: CRITICAL | HIGH | MEDIUM-HIGH | MEDIUM | LOW-MEDIUM | LOW
impactDescription: Optional description (e.g., "10-100× query speedup")
tags: clickhouse, query-optimization, schema-design
---

## Rule Title Here

Brief explanation of the rule and why it matters for ClickHouse performance or correctness.

**Incorrect:**

```sql
-- Bad example with explanation
SELECT * FROM table WHERE condition
```

**Correct:**

```sql
-- Good example with explanation
SELECT column1, column2 FROM table PREWHERE condition
```

Additional context, trade-offs, or when this rule applies.

Reference: [ClickHouse Documentation](https://clickhouse.com/docs/...)
