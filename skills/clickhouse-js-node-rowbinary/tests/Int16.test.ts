import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readInt16 } from "../src/readers/integers.js";

/**
 * Int16 is 2 bytes, little-endian, two's-complement. Each case selects the
 * value with `FORMAT RowBinary` and decodes the bytes the server produces.
 */
async function int16Reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT toInt16(${expr}) FORMAT RowBinary`));
}

describe("readInt16", () => {
  it("decodes 0", async () => {
    const r = await int16Reader("0");
    expect(readInt16(r)).toBe(0);
    expect(r.pos).toBe(2);
  });

  it("decodes 1", async () => {
    const r = await int16Reader("1");
    expect(readInt16(r)).toBe(1);
  });

  it("decodes -1 (0xffff)", async () => {
    const r = await int16Reader("-1");
    expect(readInt16(r)).toBe(-1);
  });

  // Confirms little-endian byte order: 258 = 0x0102 -> bytes 02 01.
  it("decodes 258 (little-endian byte order)", async () => {
    const r = await int16Reader("258");
    expect(readInt16(r)).toBe(258);
  });

  it("decodes 32767 (max)", async () => {
    const r = await int16Reader("32767");
    expect(readInt16(r)).toBe(32767);
  });

  it("decodes -32768 (min)", async () => {
    const r = await int16Reader("-32768");
    expect(readInt16(r)).toBe(-32768);
  });

  // Guards the byteOffset handling: a Buffer that is a window into a larger
  // ArrayBuffer (nonzero byteOffset) must still decode correctly.
  it("decodes from a buffer window with a nonzero byteOffset", () => {
    const ab = Uint8Array.from([0xaa, 0xbb, 0xcc, 0x02, 0x01]).buffer; // 258 at offset 3
    const sub = Buffer.from(ab, 3, 2);
    expect(sub.byteOffset).toBe(3);
    expect(readInt16(new Cursor(sub))).toBe(258);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toInt16(-12345) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readInt16(r);
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
