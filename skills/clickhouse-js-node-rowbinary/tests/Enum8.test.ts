import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readEnum8 } from "../src/readers/enums.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readEnum8", () => {
  it("resolves the underlying value to its name via the supplied map", async () => {
    const read = readEnum8(
      new Map([
        [1, "a"],
        [2, "b"],
      ]),
    );
    const r = await reader("CAST('b' AS Enum8('a' = 1, 'b' = 2))");
    expect(read(r)).toBe("b");
    expect(r.pos).toBe(1);
  });

  it("resolves a negative enum value", async () => {
    const read = readEnum8(
      new Map([
        [-1, "x"],
        [2, "y"],
      ]),
    );
    expect(read(await reader("CAST('x' AS Enum8('x' = -1, 'y' = 2))"))).toBe(
      "x",
    );
  });

  it("falls back to the stringified integer for an unmapped value", () => {
    // Wire byte 0x05 with an empty map => no name => "5".
    expect(readEnum8(new Map())(new Cursor(Buffer.from([5])))).toBe("5");
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const read = readEnum8(
        new Map([
          [1, "a"],
          [2, "b"],
        ]),
      );
      const full = await query(
        "SELECT CAST('b' AS Enum8('a' = 1, 'b' = 2)) FORMAT RowBinary",
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
