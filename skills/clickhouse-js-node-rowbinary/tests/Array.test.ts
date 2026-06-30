import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readArray, readNullable } from "../src/readers/composite.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt32, readUInt8 } from "../src/readers/integers.js";
import { readString } from "../src/readers/strings.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readArray", () => {
  it("decodes a fixed-width element array", async () => {
    const r = await reader("CAST([1, 2, 3] AS Array(UInt32))");
    expect(readArray(readUInt32)(r)).toEqual([1, 2, 3]);
    expect(r.pos).toBe(13); // 1 count + 3 * 4
  });

  it("decodes the empty array (just the count byte)", async () => {
    const r = await reader("CAST([] AS Array(UInt32))");
    expect(readArray(readUInt32)(r)).toEqual([]);
    expect(r.pos).toBe(1);
  });

  it("decodes a variable-length element array", async () => {
    const r = await reader("CAST(['a', 'bb'] AS Array(String))");
    expect(readArray(readString)(r)).toEqual(["a", "bb"]);
  });

  // Nesting composes by nesting the element reader.
  it("decodes Array(Array(UInt8))", async () => {
    const r = await reader("CAST([[1], [2, 3]] AS Array(Array(UInt8)))");
    expect(readArray(readArray(readUInt8))(r)).toEqual([[1], [2, 3]]);
  });

  // Composes with Nullable: the NULL element is just its flag byte.
  it("decodes Array(Nullable(UInt8)) with a NULL element", async () => {
    const r = await reader("CAST([1, NULL, 3] AS Array(Nullable(UInt8)))");
    expect(readArray(readNullable(readUInt8))(r)).toEqual([1, null, 3]);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST([1, 2, 3] AS Array(UInt32)) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readArray(readUInt32)(r);
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
