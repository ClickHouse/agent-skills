import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { formatDecimal, readDecimal256 } from "../src/readers/decimals.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readDecimal256", () => {
  it("decodes -1 at scale 0", async () => {
    const r = await reader("toDecimal256('-1', 0)");
    const dec = readDecimal256(0)(r);
    expect(dec).toEqual([-1n, 0]);
    expect(r.pos).toBe(32);
    expect(formatDecimal(dec)).toBe("-1");
  });

  // A large unscaled magnitude that only fits in 256 bits.
  it("decodes a large value at scale 10", async () => {
    const r = await reader(
      "toDecimal256('123456789012345678901234567890.0123456789', 10)",
    );
    const dec = readDecimal256(10)(r);
    expect(dec).toEqual([1234567890123456789012345678900123456789n, 10]);
    expect(formatDecimal(dec)).toBe(
      "123456789012345678901234567890.0123456789",
    );
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toDecimal256('-1', 0) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readDecimal256(0)(r);
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
