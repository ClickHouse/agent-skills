import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readDateTime64P3 } from "../src/readers/datetime.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readDateTime64P3", () => {
  // P=3 is exactly Date's resolution: the millisecond instant is lossless in
  // a single Date, no separate fraction.
  it("decodes milliseconds straight into a JS Date", async () => {
    const r = await reader("toDateTime64('2021-01-01 00:00:00.123', 3, 'UTC')");
    const d = readDateTime64P3(r);
    expect(d.toISOString()).toBe("2021-01-01T00:00:00.123Z");
    expect(r.pos).toBe(8);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT toDateTime64('2021-01-01 00:00:00.123', 3, 'UTC') FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readDateTime64P3(r);
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
