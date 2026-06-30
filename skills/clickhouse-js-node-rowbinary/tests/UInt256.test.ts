import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt256 } from "../src/readers/integers.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

const MAX =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n; // 2^256 - 1

describe("readUInt256", () => {
  it("decodes 0n", async () => {
    const r = await reader("toUInt256(0)");
    expect(readUInt256(r)).toBe(0n);
    expect(r.pos).toBe(32);
  });

  // Set the third word (bits 128..191) to confirm word ordering.
  it("decodes 2^128 (only the third word set)", async () => {
    expect(
      readUInt256(
        await reader("toUInt256('340282366920938463463374607431768211456')"),
      ),
    ).toBe(340282366920938463463374607431768211456n);
  });

  it("decodes the max (2^256 - 1)", async () => {
    expect(readUInt256(await reader(`toUInt256('${MAX}')`))).toBe(MAX);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toUInt256(5) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readUInt256(r);
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
