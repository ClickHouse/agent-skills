---
title: Filter on ORDER BY Columns in Queries
impact: CRITICAL
impactDescription: "Leading-key filters often prune best; verify later-key filters with EXPLAIN"
tags: [schema, primary-key, WHERE, query]
---

## Filter on ORDER BY Columns in Queries

**Impact: CRITICAL**

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
