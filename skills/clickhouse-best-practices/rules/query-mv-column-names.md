---
title: Alias Every Materialized View Output Column to Its Target Column Name
impact: HIGH
impactDescription: "Unmatched names are silently dropped or filled with defaults; no error is raised"
tags: [query, materialized-view, JOIN, schema, silent-data-loss]
---

## Alias Every Materialized View Output Column to Its Target Column Name

**Impact: HIGH**

A materialized view with `TO target` writes its result into the target by **column name**, not by position. A target column with no same-named column in the `SELECT` gets its default value (`0`, `''`, or the column's `DEFAULT`), and a `SELECT` column with no same-named target column is discarded. Neither case raises an error, so the view looks healthy while writing wrong data.

The usual causes are unaliased expressions (`a + b` is named `plus(a, b)`) and qualified columns from a JOIN: when both sides have a `value` column, `r.value` comes out named `r.value`, which matches neither `value` nor `r_value`.

**Incorrect (relying on column order, unaliased expression and JOIN collision):**

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

**Correct (qualify every input and alias every output to the target name):**

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

**Check an existing view (compare its output names with the target's columns):**

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

Reference: [CREATE VIEW: materialized view](https://clickhouse.com/docs/reference/statements/create/view#materialized-view), [Incremental materialized views](https://clickhouse.com/docs/concepts/features/materialized-views/incremental-materialized-view)
