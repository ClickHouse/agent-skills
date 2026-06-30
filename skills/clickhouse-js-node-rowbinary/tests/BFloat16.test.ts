import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readBFloat16 } from "../src/readers/floats.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readBFloat16", () => {
  it("decodes 0", async () => {
    const r = await reader("toBFloat16(0)");
    expect(readBFloat16(r)).toBe(0);
    expect(r.pos).toBe(2);
  });

  // Values whose float32 mantissa fits in BFloat16's 7 bits, so they survive
  // the round-trip exactly.
  it("decodes 1.5", async () => {
    expect(readBFloat16(await reader("toBFloat16(1.5)"))).toBe(1.5);
  });

  it("decodes -2.5", async () => {
    expect(readBFloat16(await reader("toBFloat16(-2.5)"))).toBe(-2.5);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toBFloat16(1.5) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readBFloat16(r);
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
