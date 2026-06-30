import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readInt64 } from "../src/readers/integers.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readInt64", () => {
  it("decodes 0n", async () => {
    const r = await reader("toInt64(0)");
    expect(readInt64(r)).toBe(0n);
    expect(r.pos).toBe(8);
  });

  it("decodes -1n", async () => {
    expect(readInt64(await reader("toInt64(-1)"))).toBe(-1n);
  });

  it("decodes 9223372036854775807n (max)", async () => {
    expect(readInt64(await reader("toInt64(9223372036854775807)"))).toBe(
      9223372036854775807n,
    );
  });

  it("decodes -9223372036854775808n (min)", async () => {
    expect(readInt64(await reader("toInt64(-9223372036854775808)"))).toBe(
      -9223372036854775808n,
    );
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toInt64(-5) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readInt64(r);
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
