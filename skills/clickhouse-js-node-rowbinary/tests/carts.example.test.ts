import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import { type CartRow, readCartRow } from "../src/examples/carts.js";
import { readRows } from "../src/readers/rows.js";

/**
 * Runs the `carts` example end to end (nested generics): an Array of named
 * Tuples and an Array of Nullables. Populated via `JSONEachRow`; the second row
 * is fully empty so both arrays read as a single count byte.
 */
describe("example: carts (nested generics via JSONEachRow)", () => {
  it("creates, populates, and reads back through readCartRow", async () => {
    const t = "rb_example_carts";
    await query(`DROP TABLE IF EXISTS ${t}`);
    await query(
      `CREATE TABLE ${t} (` +
        `cart_id UInt32, ` +
        `items Array(Tuple(sku String, qty UInt16)), ` +
        `discounts Array(Nullable(Int32))` +
        `) ENGINE = Memory`,
    );
    try {
      const rows = [
        {
          cart_id: 1,
          items: [
            { sku: "A", qty: 2 },
            { sku: "B", qty: 1 },
          ],
          discounts: [10, null, 5],
        },
        { cart_id: 2, items: [], discounts: [] },
      ];
      await query(
        `INSERT INTO ${t} FORMAT JSONEachRow\n` +
          rows.map((r) => JSON.stringify(r)).join("\n"),
      );

      const r = new Cursor(
        await query(
          `SELECT cart_id, items, discounts FROM ${t} ORDER BY cart_id FORMAT RowBinary`,
        ),
      );
      const out: CartRow[] = readRows(readCartRow)(r);
      expect(out).toEqual([
        {
          cartId: 1,
          items: [
            { sku: "A", qty: 2 },
            { sku: "B", qty: 1 },
          ],
          discounts: [10, null, 5],
        },
        { cartId: 2, items: [], discounts: [] },
      ]);
      expect(r.pos).toBe(r.buf.length);
    } finally {
      await query(`DROP TABLE IF EXISTS ${t}`);
    }
  });
});
