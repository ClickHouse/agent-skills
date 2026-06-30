import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readInt8 } from "../src/readers/integers.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readInt8", () => {
  it("decodes 0", async () => {
    const r = await reader("toInt8(0)");
    expect(readInt8(r)).toBe(0);
    expect(r.pos).toBe(1);
  });

  it("decodes 127 (max)", async () => {
    expect(readInt8(await reader("toInt8(127)"))).toBe(127);
  });

  it("decodes -1", async () => {
    expect(readInt8(await reader("toInt8(-1)"))).toBe(-1);
  });

  it("decodes -128 (min)", async () => {
    expect(readInt8(await reader("toInt8(-128)"))).toBe(-128);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toInt8(-1) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readInt8(r);
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
