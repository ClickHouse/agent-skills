---
title: Diagnose Stuck Mutations Before Killing or Resubmitting
impact: HIGH
impactDescription: "A mutation that fails on one part retries indefinitely and blocks every later mutation on the table"
tags: [insert, mutation, ALTER, KILL MUTATION, TOO_MANY_MUTATIONS, system.mutations]
---

## Diagnose Stuck Mutations Before Killing or Resubmitting

**Impact: HIGH**

`ALTER TABLE ... UPDATE/DELETE`, column type changes (`MODIFY COLUMN x NewType`), lightweight `DELETE FROM`, `MATERIALIZE INDEX/TTL/COLUMN`, and column `RENAME`/`DROP` all run as mutations, and a table's mutations run in order. If a mutation throws on one part (for example a type cast that fails on some rows), it keeps retrying that part until it is killed. Every later mutation, including a lightweight `DELETE`, waits behind it. With the default `mutations_sync = 0`, `ALTER ... UPDATE/DELETE` returns success before any part is processed, so the client never sees the error. A type change waits for its mutation (`alter_sync = 1`) and fails with `UNFINISHED` (Code 341), but the mutation stays queued. Once a table has `number_of_mutations_to_delay` unfinished mutations, new ones are slowed down. At `number_of_mutations_to_throw` they are rejected with `TOO_MANY_MUTATIONS` (Code 692). Check the effective values on your server and any table-level overrides in `SHOW CREATE TABLE`.

A mutation can also be slow without failing: it cannot mutate a part while a merge owns that part, so `parts_to_do` stays flat, with no `latest_fail_reason`, until a large merge finishes.

**Incorrect (reacting without reading the failure):**

```sql
-- Resubmitting the same ALTER adds another mutation that fails the same way
ALTER TABLE events UPDATE amount = toUInt32(amount_str) WHERE 1;

-- Raising the limit only lets the backlog grow
ALTER TABLE events MODIFY SETTING number_of_mutations_to_throw = 10000;

-- Kills every mutation on the table, including unrelated healthy ones
KILL MUTATION WHERE database = 'db' AND table = 'events';
```

**Correct (find the failing mutation, then decide):**

```sql
-- Unfinished mutations, oldest first; a non-empty latest_fail_reason means it is retrying a failure
SELECT database, table, mutation_id, command, create_time, parts_to_do,
       latest_failed_part, latest_fail_time, latest_fail_reason
FROM system.mutations
WHERE is_done = 0
ORDER BY create_time
LIMIT 50;

-- No failure but no progress: look for a long merge holding the parts
SELECT elapsed, round(progress, 2) AS progress, is_mutation, num_parts,
       formatReadableSize(total_size_bytes_compressed) AS size, result_part_name
FROM system.merges
WHERE database = 'db' AND table = 'events'
ORDER BY elapsed DESC
LIMIT 20;
```

If a merge holds the parts and `parts_to_do` decreases between checks, the mutation is healthy and waiting. If it has a failure reason, fix the data or rewrite the command so it cannot throw (for example `toUInt32OrZero` instead of `toUInt32`). Then, with the user's explicit approval, kill only that mutation, using the exact `mutation_id` from `system.mutations` (`mutation_42.txt` on `MergeTree`, `0000000042` on replicated tables). Preview it with `TEST` first:

```sql
KILL MUTATION WHERE database = 'db' AND table = 'events' AND mutation_id = 'mutation_42.txt' TEST;
KILL MUTATION WHERE database = 'db' AND table = 'events' AND mutation_id = 'mutation_42.txt';
```

`KILL MUTATION` is not an undo: parts it already rewrote keep the new values, and parts it had not reached keep the old ones. Metadata changes also stay. For example, `MODIFY COLUMN x UInt32` on a `Nullable(UInt32)` column that contains NULLs changes the table definition, then fails on every part that has NULLs. After the kill, the column is still declared `UInt32`, and on 25.3 reading `x` fails with Code 349. To recover, with the same approval, change the column back to its old type, fill in the NULLs, and wait for that `UPDATE` to finish before changing the type again. On 25.3, when the `UPDATE` was still pending, ClickHouse applied both mutations to the part in one pass and the cast failed again:

```sql
ALTER TABLE events MODIFY COLUMN x Nullable(UInt32);
ALTER TABLE events UPDATE x = 0 WHERE x IS NULL SETTINGS mutations_sync = 2;  -- choose the fill value deliberately
ALTER TABLE events MODIFY COLUMN x UInt32;
```

On ClickHouse Cloud, a killed mutation can show `is_killed = 1` with `is_done = 0` for some time while other work on the table finishes. The docs describe this as normal.

Reference: [KILL MUTATION](https://clickhouse.com/docs/reference/statements/kill#kill-mutation), [system.mutations](https://clickhouse.com/docs/reference/system-tables/mutations)
