import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readBool } from "../src/readers/bool.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readBool", () => {
  it("decodes true", async () => {
    const r = await reader("true");
    expect(readBool(r)).toBe(true);
    expect(r.pos).toBe(1);
  });

  it("decodes false", async () => {
    expect(readBool(await reader("false"))).toBe(false);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT true FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readBool(r);
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
