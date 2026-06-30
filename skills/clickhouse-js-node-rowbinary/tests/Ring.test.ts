import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readRing } from "../src/readers/geo.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readRing", () => {
  it("decodes a Ring as an array of points", async () => {
    const r = await reader("CAST([(0, 0), (1, 2)] AS Ring)");
    expect(readRing(r)).toEqual([
      [0, 0],
      [1, 2],
    ]);
    expect(r.pos).toBe(33); // 1 count + 2 * 16
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST([(0, 0), (1, 2)] AS Ring) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readRing(r);
        } catch (e) {
          thrown = e;
        }
        expect(thrown, `prefix length ${len} of ${full.length}`).toBe(
          NeedMoreData,
        );
      }
    });
  });
});
