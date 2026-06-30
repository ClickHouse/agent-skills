import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readFloat64 } from "../src/readers/floats.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readFloat64", () => {
  it("decodes 0", async () => {
    const r = await reader("toFloat64(0)");
    expect(readFloat64(r)).toBe(0);
    expect(r.pos).toBe(8);
  });

  it("decodes 1.5", async () => {
    expect(readFloat64(await reader("toFloat64(1.5)"))).toBe(1.5);
  });

  // float64 represents 0.1 exactly as the same double JS uses.
  it("decodes 0.1", async () => {
    expect(readFloat64(await reader("toFloat64(0.1)"))).toBe(0.1);
  });

  it("decodes -inf", async () => {
    expect(readFloat64(await reader("toFloat64(-inf)"))).toBe(-Infinity);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toFloat64(1.5) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readFloat64(r);
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
