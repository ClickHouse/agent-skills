---
title: Measure Compression Per Table and Column Before Tuning Types or Codecs
impact: MEDIUM
impactDescription: "Finds the few columns that dominate storage; compact parts hide per-column sizes"
tags: [schema, compression, codecs, system.parts, system.columns]
---

## Measure Compression Per Table and Column Before Tuning Types or Codecs

**Impact: MEDIUM**

Storage is often dominated by a few columns. Measure before changing types or codecs, and read the right system table for each level:

- **Per table**: sum `data_compressed_bytes` and `data_uncompressed_bytes` over **active** parts in `system.parts`. Inactive parts are merged-away copies waiting for cleanup, and counting them inflates the totals.
- **Per column**: `system.columns` (table-wide totals, plus `compression_codec`) or `system.parts_columns` (per part). These only count **wide** parts. Compact parts store all columns in one file and report `0` for each column. In a table with many small or recent parts, the column totals add up to less than the table total from `system.parts`. Wide versus compact is controlled by `min_bytes_for_wide_part` and `min_rows_for_wide_part`, so check the effective values.

**Incorrect (sizing from every part, or trusting column sums alone):**

```sql
-- Includes inactive parts, and ranks columns without checking how much data is in compact parts
SELECT table, sum(data_compressed_bytes) FROM system.parts GROUP BY table;
SELECT name, data_compressed_bytes FROM system.columns WHERE table = 'events';
```

**Correct (active parts per table, then columns, with the compact-part share visible):**

```sql
SELECT database, table,
       formatReadableSize(sum(data_compressed_bytes)) AS compressed,
       formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed,
       round(sum(data_uncompressed_bytes) / sum(data_compressed_bytes), 2) AS ratio,
       countIf(part_type = 'Compact') AS compact_parts,
       count() AS parts
FROM system.parts
WHERE active
GROUP BY database, table
ORDER BY sum(data_compressed_bytes) DESC
LIMIT 20;

SELECT name, type, compression_codec,
       formatReadableSize(data_compressed_bytes) AS compressed,
       round(data_uncompressed_bytes / nullIf(data_compressed_bytes, 0), 2) AS ratio
FROM system.columns
WHERE database = 'db' AND table = 'events'
ORDER BY data_compressed_bytes DESC
LIMIT 50;
```

To compare a candidate type or codec, copy a representative sample into a scratch table. Force wide parts so every column is measured, merge, and compare the same column in `system.parts_columns`:

```sql
-- A SETTINGS clause here replaces the source table's settings: repeat its overrides from SHOW CREATE TABLE
CREATE TABLE events_codec_test AS events SETTINGS min_bytes_for_wide_part = 0;
ALTER TABLE events_codec_test MODIFY COLUMN ts DateTime CODEC(Delta, ZSTD(1));
INSERT INTO events_codec_test SELECT * FROM events WHERE event_date = today() - 1;
OPTIMIZE TABLE events_codec_test FINAL;
```

For fixes, start with the type rules: [schema-types-lowcardinality](schema-types-lowcardinality.md), [schema-types-minimize-bitwidth](schema-types-minimize-bitwidth.md), [schema-types-native-types](schema-types-native-types.md), [schema-types-avoid-nullable](schema-types-avoid-nullable.md).

Reference: [Compression in ClickHouse](https://clickhouse.com/docs/guides/clickhouse/data-modelling/compression/compression-in-clickhouse), [system.parts](https://clickhouse.com/docs/reference/system-tables/parts)
