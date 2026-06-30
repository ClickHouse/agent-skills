import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt8 } from "../src/readers/integers.js";

describe("readUInt8", () => {
  it("reads sequential unsigned bytes", () => {
    const r = new Cursor(Buffer.from([1, 2, 255]));
    expect(readUInt8(r)).toBe(1);
    expect(readUInt8(r)).toBe(2);
    expect(readUInt8(r)).toBe(255);
    expect(r.pos).toBe(3);
  });

  it("decodes a UInt8 straight from ClickHouse", async () => {
    const bytes = await query("SELECT toUInt8(255) FORMAT RowBinary");
    const r = new Cursor(bytes);
    expect(readUInt8(r)).toBe(255);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toUInt8(255) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readUInt8(r);
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
