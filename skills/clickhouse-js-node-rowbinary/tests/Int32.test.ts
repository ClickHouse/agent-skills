import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readInt32 } from "../src/readers/integers.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readInt32", () => {
  it("decodes 0", async () => {
    const r = await reader("toInt32(0)");
    expect(readInt32(r)).toBe(0);
    expect(r.pos).toBe(4);
  });

  it("decodes -1", async () => {
    expect(readInt32(await reader("toInt32(-1)"))).toBe(-1);
  });

  it("decodes 2147483647 (max)", async () => {
    expect(readInt32(await reader("toInt32(2147483647)"))).toBe(2147483647);
  });

  it("decodes -2147483648 (min)", async () => {
    expect(readInt32(await reader("toInt32(-2147483648)"))).toBe(-2147483648);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toInt32(-5) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readInt32(r);
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
