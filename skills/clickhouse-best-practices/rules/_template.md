---
title: Rule Title Here
impact: CRITICAL | HIGH | MEDIUM | LOW
impactDescription: "Quantified improvement (e.g., 10x faster queries)"
tags: [tag1, tag2]
---

## Rule Title Here

**Impact: CRITICAL** (optional description)

Explain when the recommendation helps, its semantic constraints, and how to verify it. Give applicable versions/settings and a dated source check for version-sensitive claims. Use measured impact only when supported by a benchmark. Conditional examples can replace incorrect/correct labels when both alternatives are valid.

**Incorrect (description of what's wrong):**

```sql
-- Bad: description
SELECT * FROM table;
```

**Correct (description of what's right):**

```sql
-- Good: description
SELECT * FROM table;
```

Reference: [Official Docs](https://clickhouse.com/docs/best-practices/...)
