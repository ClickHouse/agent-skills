import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readFloat32 } from "../src/readers/floats.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readFloat32", () => {
  it("decodes 0", async () => {
    const r = await reader("toFloat32(0)");
    expect(readFloat32(r)).toBe(0);
    expect(r.pos).toBe(4);
  });

  // Values exactly representable in float32, so no rounding to account for.
  it("decodes 1.5", async () => {
    expect(readFloat32(await reader("toFloat32(1.5)"))).toBe(1.5);
  });

  it("decodes -2.5", async () => {
    expect(readFloat32(await reader("toFloat32(-2.5)"))).toBe(-2.5);
  });

  it("decodes inf", async () => {
    expect(readFloat32(await reader("toFloat32(inf)"))).toBe(Infinity);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toFloat32(1.5) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readFloat32(r);
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
