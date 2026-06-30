import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readMultiLineString } from "../src/readers/geo.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readMultiLineString", () => {
  it("decodes a MultiLineString as an array of line strings", async () => {
    const r = await reader("CAST([[(0, 0), (1, 1)]] AS MultiLineString)");
    expect(readMultiLineString(r)).toEqual([
      [
        [0, 0],
        [1, 1],
      ],
    ]);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST([[(0, 0), (1, 1)]] AS MultiLineString) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readMultiLineString(r);
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
