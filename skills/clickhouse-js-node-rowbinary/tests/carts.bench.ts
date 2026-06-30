import { bench, describe } from "vitest";
import { query } from "./clickhouse.js";
import { type Reader, Cursor } from "../src/readers/core.js";
import {
  type CartRow,
  readCartRow,
  readCartRowFast,
} from "../src/examples/carts.js";

/**
 * Benchmark: API-combinator `readCartRow` vs monomorphized `readCartRowFast`
 * over the same large buffer. Nested generics — `Array(Tuple(...))` and
 * `Array(Nullable(...))` — so the API version rebuilds nested closures per row;
 * the inlined version flattens both levels.
 */
const N = 20_000;
const BUF = await query(
  `SELECT toUInt32(number) AS cart_id, ` +
    `arrayMap(x -> CAST(tuple(concat('s', toString(x)), toUInt16(x)) AS Tuple(sku String, qty UInt16)), range(number % 3)) AS items, ` +
    `arrayMap(x -> CAST(if(x % 2 = 0, toInt32(x), NULL) AS Nullable(Int32)), range(number % 4)) AS discounts ` +
    `FROM numbers(${N}) FORMAT RowBinary`,
);

function decodeAll(read: Reader<CartRow>): CartRow[] {
  const s = new Cursor(BUF);
  const out: CartRow[] = [];
  while (s.pos < s.buf.length) out.push(read(s));
  return out;
}

const norm = (rows: CartRow[]): string => JSON.stringify(rows);
{
  const a = decodeAll(readCartRow);
  const b = decodeAll(readCartRowFast);
  if (a.length !== N)
    throw new Error(`carts: decoded ${a.length} rows, expected ${N}`);
  if (norm(a) !== norm(b)) throw new Error("carts: API vs fast mismatch");
}

describe("example carts: API vs optimized", () => {
  bench("API (combinators)", () => {
    decodeAll(readCartRow);
  });
  bench("optimized (monomorphized)", () => {
    decodeAll(readCartRowFast);
  });
});
