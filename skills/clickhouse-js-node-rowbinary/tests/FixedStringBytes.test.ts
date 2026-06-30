import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readFixedStringBytes } from "../src/readers/strings.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readFixedStringBytes", () => {
  it("returns the raw bytes, padding included", async () => {
    const r = await reader("toFixedString('ab', 4)");
    expect(readFixedStringBytes(4)(r)).toEqual(Buffer.from([0x61, 0x62, 0, 0]));
    expect(r.pos).toBe(4);
  });

  // The default is a zero-copy view, so it shares memory with the source.
  it("returns a zero-copy view sharing memory", async () => {
    const r = await reader("toFixedString('ab', 4)");
    const bytes = readFixedStringBytes(4)(r);
    r.buf[0] = 0xff;
    expect(bytes[0]).toBe(0xff);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT toFixedString('ab', 4) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readFixedStringBytes(4)(r);
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
