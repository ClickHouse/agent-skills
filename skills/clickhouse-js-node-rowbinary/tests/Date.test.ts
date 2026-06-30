import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readDate } from "../src/readers/datetime.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readDate", () => {
  it("decodes to a JS Date at UTC midnight", async () => {
    const r = await reader("toDate('2021-03-15')");
    const d = readDate(r);
    expect(d.toISOString()).toBe("2021-03-15T00:00:00.000Z");
    expect(r.pos).toBe(2);
  });

  it("decodes the epoch", async () => {
    const d = readDate(await reader("toDate('1970-01-01')"));
    expect(d.toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toDate('2021-03-15') FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readDate(r);
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
