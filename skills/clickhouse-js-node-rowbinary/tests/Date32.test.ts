import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readDate32 } from "../src/readers/datetime.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readDate32", () => {
  it("decodes a pre-1970 date (negative days) to a JS Date", async () => {
    const r = await reader("toDate32('1950-01-01')");
    const d = readDate32(r);
    expect(d.toISOString()).toBe("1950-01-01T00:00:00.000Z");
    expect(r.pos).toBe(4);
  });

  it("decodes a post-1970 date", async () => {
    const d = readDate32(await reader("toDate32('2021-03-15')"));
    expect(d.toISOString()).toBe("2021-03-15T00:00:00.000Z");
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT toDate32('1950-01-01') FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readDate32(r);
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
