import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readFixedString } from "../src/readers/strings.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readFixedString", () => {
  it("decodes a full-width value (no padding)", async () => {
    const r = await reader("toFixedString('abcd', 4)");
    expect(readFixedString(4)(r)).toBe("abcd");
    expect(r.pos).toBe(4);
  });

  // Shorter content is right-padded with NUL bytes, which are preserved.
  it("preserves trailing NUL padding", async () => {
    expect(readFixedString(4)(await reader("toFixedString('ab', 4)"))).toBe(
      "ab\x00\x00",
    );
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
          readFixedString(4)(r);
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
