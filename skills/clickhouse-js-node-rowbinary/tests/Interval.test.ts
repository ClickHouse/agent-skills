import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readInterval } from "../src/readers/interval.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

// All 11 Interval* types share one Int64 wire; the unit lives in the type name.
describe("readInterval", () => {
  it("decodes a positive count (IntervalSecond)", async () => {
    const r = await reader("toIntervalSecond(5)");
    expect(readInterval(r)).toBe(5n);
    expect(r.pos).toBe(8);
  });

  it("decodes a negative count (IntervalDay)", async () => {
    expect(readInterval(await reader("toIntervalDay(-3)"))).toBe(-3n);
  });

  it("decodes a large count (IntervalNanosecond)", async () => {
    expect(readInterval(await reader("toIntervalNanosecond(1000000000)"))).toBe(
      1000000000n,
    );
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toIntervalSecond(5) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readInterval(r);
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
