import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import { type OrderRow, readOrderRow } from "../src/examples/orders.js";
import { readRows } from "../src/readers/rows.js";

/**
 * Runs the `orders` example end to end (UUID / Decimal / Enum). These types are
 * awkward or lossy as JSON — UUID and Enum as names, Decimal as a float that
 * can't represent every value exactly — so the rows go in as raw SQL `VALUES`
 * instead of `JSONEachRow`.
 */
describe("example: orders (UUID / Decimal / Enum via raw VALUES)", () => {
  it("creates, populates, and reads back through readOrderRow", async () => {
    const t = "rb_example_orders";
    await query(`DROP TABLE IF EXISTS ${t}`);
    await query(
      `CREATE TABLE ${t} (` +
        `id UInt8, ` +
        `uid UUID, ` +
        `price Decimal64(2), ` +
        `status Enum8('new' = 1, 'shipped' = 2, 'done' = 3)` +
        `) ENGINE = Memory`,
    );
    try {
      await query(
        `INSERT INTO ${t} VALUES ` +
          `(1, '61f0c404-5cb3-11e7-907b-a6006ad3dba0', 12.34, 'new'), ` +
          `(2, '00000000-0000-0000-0000-000000000000', 0.00, 'shipped'), ` +
          `(3, 'ffffffff-ffff-ffff-ffff-ffffffffffff', -9.99, 'done')`,
      );

      const r = new Cursor(
        await query(
          `SELECT id, uid, price, status FROM ${t} ORDER BY id FORMAT RowBinary`,
        ),
      );
      const out: OrderRow[] = readRows(readOrderRow)(r);
      expect(out).toEqual([
        {
          id: 1,
          uid: "61f0c404-5cb3-11e7-907b-a6006ad3dba0",
          price: [1234n, 2],
          status: 1,
        },
        {
          id: 2,
          uid: "00000000-0000-0000-0000-000000000000",
          price: [0n, 2],
          status: 2,
        },
        {
          id: 3,
          uid: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          price: [-999n, 2],
          status: 3,
        },
      ]);
      expect(r.pos).toBe(r.buf.length);
    } finally {
      await query(`DROP TABLE IF EXISTS ${t}`);
    }
  });
});
