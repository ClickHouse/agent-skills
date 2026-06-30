import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readEnum16 } from "../src/readers/enums.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readEnum16", () => {
  it("resolves a 16-bit underlying value to its name", async () => {
    const read = readEnum16(
      new Map([
        [1, "small"],
        [300, "big"],
      ]),
    );
    const r = await reader("CAST('big' AS Enum16('small' = 1, 'big' = 300))");
    expect(read(r)).toBe("big");
    expect(r.pos).toBe(2);
  });

  it("resolves a negative enum value", async () => {
    const read = readEnum16(
      new Map([
        [-1000, "lo"],
        [1000, "hi"],
      ]),
    );
    expect(
      read(await reader("CAST('lo' AS Enum16('lo' = -1000, 'hi' = 1000))")),
    ).toBe("lo");
  });

  it("falls back to the stringified integer for an unmapped value", () => {
    // Wire bytes for Int16 300 (little-endian) with an empty map => "300".
    expect(readEnum16(new Map())(new Cursor(Buffer.from([0x2c, 0x01])))).toBe(
      "300",
    );
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const read = readEnum16(
        new Map([
          [1, "small"],
          [300, "big"],
        ]),
      );
      const full = await query(
        "SELECT CAST('big' AS Enum16('small' = 1, 'big' = 300)) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          read(r);
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
