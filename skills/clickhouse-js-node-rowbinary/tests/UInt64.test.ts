import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt64 } from "../src/readers/integers.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readUInt64", () => {
  it("decodes 0n", async () => {
    const r = await reader("toUInt64(0)");
    expect(readUInt64(r)).toBe(0n);
    expect(r.pos).toBe(8);
  });

  it("decodes 1n", async () => {
    expect(readUInt64(await reader("toUInt64(1)"))).toBe(1n);
  });

  it("decodes 18446744073709551615n (max)", async () => {
    expect(readUInt64(await reader("toUInt64(18446744073709551615)"))).toBe(
      18446744073709551615n,
    );
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toUInt64(5) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readUInt64(r);
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
