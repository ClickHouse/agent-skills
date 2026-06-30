import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { formatDecimal, readDecimal32 } from "../src/readers/decimals.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readDecimal32", () => {
  it("decodes 1.5 at scale 4 as [unscaled, scale]", async () => {
    const r = await reader("toDecimal32(1.5, 4)");
    const dec = readDecimal32(4)(r);
    expect(dec).toEqual([15000n, 4]);
    expect(r.pos).toBe(4);
    // formatDecimal keeps the trailing zeros (CH text would show "1.5").
    expect(formatDecimal(dec)).toBe("1.5000");
  });

  it("keeps a pure fraction lossless", async () => {
    const dec = readDecimal32(3)(await reader("toDecimal32(0.005, 3)"));
    expect(dec).toEqual([5n, 3]);
    expect(formatDecimal(dec)).toBe("0.005");
  });

  it("decodes a negative value", async () => {
    const dec = readDecimal32(4)(await reader("toDecimal32(-1.5, 4)"));
    expect(dec).toEqual([-15000n, 4]);
    expect(formatDecimal(dec)).toBe("-1.5000");
  });

  it("decodes scale 0 (formats with no decimal point)", async () => {
    const dec = readDecimal32(0)(await reader("toDecimal32(42, 0)"));
    expect(dec).toEqual([42n, 0]);
    expect(formatDecimal(dec)).toBe("42");
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toDecimal32(1.5, 4) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readDecimal32(4)(r);
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
