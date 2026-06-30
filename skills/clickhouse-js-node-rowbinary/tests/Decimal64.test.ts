import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { formatDecimal, readDecimal64 } from "../src/readers/decimals.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readDecimal64", () => {
  it("decodes -12.34 at scale 2", async () => {
    const r = await reader("toDecimal64(-12.34, 2)");
    const dec = readDecimal64(2)(r);
    expect(dec).toEqual([-1234n, 2]);
    expect(r.pos).toBe(8);
    expect(formatDecimal(dec)).toBe("-12.34");
  });

  it("keeps the declared scale's trailing zero in the raw value", async () => {
    const dec = readDecimal64(2)(await reader("toDecimal64(1.20, 2)"));
    expect(dec).toEqual([120n, 2]);
    // CH text would show "1.2"; formatDecimal keeps the scale: "1.20".
    expect(formatDecimal(dec)).toBe("1.20");
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT toDecimal64(-12.34, 2) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readDecimal64(2)(r);
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
