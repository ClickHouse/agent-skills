import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt128 } from "../src/readers/integers.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

const MAX = 340282366920938463463374607431768211455n; // 2^128 - 1

describe("readUInt128", () => {
  it("decodes 0n", async () => {
    const r = await reader("toUInt128(0)");
    expect(readUInt128(r)).toBe(0n);
    expect(r.pos).toBe(16);
  });

  // Value in the high word confirms the low/high composition.
  it("decodes 2^64 (only the high word set)", async () => {
    expect(readUInt128(await reader("toUInt128('18446744073709551616')"))).toBe(
      18446744073709551616n,
    );
  });

  it("decodes the max (2^128 - 1)", async () => {
    expect(readUInt128(await reader(`toUInt128('${MAX}')`))).toBe(MAX);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toUInt128(5) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readUInt128(r);
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
