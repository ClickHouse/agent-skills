import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { formatDecimal, readDecimal128 } from "../src/readers/decimals.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readDecimal128", () => {
  it("decodes -123.456789 at scale 6", async () => {
    const r = await reader("toDecimal128('-123.456789', 6)");
    const dec = readDecimal128(6)(r);
    expect(dec).toEqual([-123456789n, 6]);
    expect(r.pos).toBe(16);
    expect(formatDecimal(dec)).toBe("-123.456789");
  });

  // Unscaled = 2^63, beyond Int64 range — exercises the 128-bit composition.
  it("decodes a value whose unscaled int exceeds 64 bits", async () => {
    const r = await reader("toDecimal128('92233720368547758.08', 2)");
    const dec = readDecimal128(2)(r);
    expect(dec).toEqual([9223372036854775808n, 2]);
    expect(formatDecimal(dec)).toBe("92233720368547758.08");
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT toDecimal128('-123.456789', 6) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readDecimal128(6)(r);
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
