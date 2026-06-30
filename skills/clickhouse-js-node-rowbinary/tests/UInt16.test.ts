import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt16 } from "../src/readers/integers.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readUInt16", () => {
  it("decodes 0", async () => {
    const r = await reader("toUInt16(0)");
    expect(readUInt16(r)).toBe(0);
    expect(r.pos).toBe(2);
  });

  // Confirms little-endian byte order: 258 = 0x0102 -> bytes 02 01.
  it("decodes 258 (little-endian byte order)", async () => {
    expect(readUInt16(await reader("toUInt16(258)"))).toBe(258);
  });

  it("decodes 65535 (max)", async () => {
    expect(readUInt16(await reader("toUInt16(65535)"))).toBe(65535);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toUInt16(258) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readUInt16(r);
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
