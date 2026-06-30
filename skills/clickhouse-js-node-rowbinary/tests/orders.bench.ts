import { bench, describe } from "vitest";
import { query } from "./clickhouse.js";
import { type Reader, Cursor } from "../src/readers/core.js";
import {
  type OrderRow,
  readOrderRow,
  readOrderRowFast,
} from "../src/examples/orders.js";

/**
 * Benchmark: API-combinator `readOrderRow` (BigInt `formatUUID`) vs
 * `readOrderRowFast` (lookup-table `formatUUIDTable` + inlined reads) over the
 * same large buffer. Since every row stringifies a UUID, the formatter swap is
 * expected to dominate the win.
 */
const N = 20_000;
const BUF = await query(
  `SELECT toUInt8(number % 251) AS id, generateUUIDv4() AS uid, ` +
    `toDecimal64(number / 100, 2) AS price, ` +
    `CAST(toInt8(number % 3 + 1) AS Enum8('new' = 1, 'shipped' = 2, 'done' = 3)) AS status ` +
    `FROM numbers(${N}) FORMAT RowBinary`,
);

function decodeAll(read: Reader<OrderRow>): OrderRow[] {
  const s = new Cursor(BUF);
  const out: OrderRow[] = [];
  while (s.pos < s.buf.length) out.push(read(s));
  return out;
}

const norm = (rows: OrderRow[]): string =>
  JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? `${v}n` : v));
{
  const a = decodeAll(readOrderRow);
  const b = decodeAll(readOrderRowFast);
  if (a.length !== N)
    throw new Error(`orders: decoded ${a.length} rows, expected ${N}`);
  if (norm(a) !== norm(b)) throw new Error("orders: API vs fast mismatch");
}

describe("example orders: API vs optimized", () => {
  bench("API (formatUUID + combinators)", () => {
    decodeAll(readOrderRow);
  });
  bench("optimized (formatUUIDTable + inlined)", () => {
    decodeAll(readOrderRowFast);
  });
});
