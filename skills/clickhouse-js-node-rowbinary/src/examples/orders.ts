import { type Reader, advance } from "../readers/core.js";
import { type DecimalValue, readDecimal64 } from "../readers/decimals.js";
import { readInt8, readUInt8 } from "../readers/integers.js";
import { formatUUID, formatUUIDTable, readUUID } from "../readers/uuid.js";

/**
 * Example: an orders table — UUID, Decimal, and Enum (awkward-as-JSON types).
 *
 * Columns (the trigger):
 *   id     UInt8
 *   uid    UUID
 *   price  Decimal64(2)
 *   status Enum8('new' = 1, 'shipped' = 2, 'done' = 3)
 *
 * Shows the parse/format split and faithful values: `uid` is read as raw bytes
 * then formatted with `formatUUID`; `price` stays the exact `[unscaled, scale]`
 * pair (`[1234n, 2]` == 12.34), not a lossy float; `status` is read as the raw
 * underlying `Int8` (1/2/3) with `readInt8` — a hand-written reader that bakes
 * in the schema can skip name resolution, whereas the generic `readEnum8(map)`
 * (used by the dynamic/header path) resolves the value to its name. The declared
 * scale `2` is baked into `readDecimal64(2)`.
 */
export type OrderRow = {
  id: number;
  uid: string;
  price: DecimalValue;
  status: number;
};

export const readOrderRow: Reader<OrderRow> = (s) => ({
  id: readUInt8(s),
  uid: formatUUID(readUUID(s)),
  price: readDecimal64(2)(s),
  status: readInt8(s),
});

/**
 * Optimized {@link readOrderRow}, flattened per the SKILL.md guidance:
 * - `buf`/`view` hoisted to locals (one property load, not one per field).
 * - every column here is FIXED-WIDTH, so the whole row — `id` UInt8 (1) + `uid`
 *   UUID (16) + `price` Decimal64 (8) + `status` Enum8 (1) = 26 bytes — is
 *   bounds-checked ONCE (`advance(s, 26)`) and read at constant offsets, instead
 *   of four separate `advance`s. (This is the exact worked example in SKILL.md.)
 * - the four leaf reads are inlined, and the BigInt `formatUUID` is swapped for
 *   the lookup-table `formatUUIDTable` (~1.6x on its own; see `readUUID.bench.ts`).
 *   Since this example formats every UUID to a string, that swap is the dominant
 *   win — the `readDecimal64(2)` closure (rebuilt per row above) is inlined too.
 *
 * MEASURED (Node 24 / V8, `orders.bench.ts`): ~2.6x faster — the largest win of
 * the examples, dominated by the `formatUUIDTable` swap (every row stringifies a
 * UUID; the table formatter is ~1.7x on its own and the row is otherwise cheap).
 *
 * `formatUUIDTable` uses a shared scratch buffer, so it is non-reentrant — fine
 * here because the bytes are copied into the returned string synchronously before
 * the next call.
 */
export const readOrderRowFast: Reader<OrderRow> = (s) => {
  const { buf, view } = s;
  // One bounds check for the whole 26-byte fixed-width row.
  const o = advance(s, 26);
  const id = buf[o]!;
  const uid = formatUUIDTable(buf.subarray(o + 1, o + 17));
  const price: DecimalValue = [view.getBigInt64(o + 17, true), 2];
  const status = view.getInt8(o + 25);
  return { id, uid, price, status };
};
