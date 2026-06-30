import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readMap, readNullable } from "../src/readers/composite.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt32, readUInt8 } from "../src/readers/integers.js";
import { readString } from "../src/readers/strings.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readMap", () => {
  it("decodes key/value pairs into a JS Map", async () => {
    const r = await reader("CAST(map('a', 1, 'b', 2) AS Map(String, UInt32))");
    const m = readMap(readString, readUInt32)(r);
    expect(m).toEqual(
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    );
    expect(r.pos).toBe(13); // 1 count + 2 * (2-byte key + 4-byte value)
  });

  it("decodes the empty map (just the count byte)", async () => {
    const r = await reader("CAST(map() AS Map(String, UInt32))");
    expect(readMap(readString, readUInt32)(r)).toEqual(new Map());
    expect(r.pos).toBe(1);
  });

  // Composes: a Nullable value (NULL is just its flag byte).
  it("decodes Map(UInt8, Nullable(String)) with a NULL value", async () => {
    const r = await reader(
      "CAST(map(1, 'x', 2, NULL) AS Map(UInt8, Nullable(String)))",
    );
    const m = readMap(readUInt8, readNullable(readString))(r);
    expect(m).toEqual(
      new Map<number, string | null>([
        [1, "x"],
        [2, null],
      ]),
    );
    expect(r.pos).toBe(7);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST(map('a', 1, 'b', 2) AS Map(String, UInt8)) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readMap(readString, readUInt8)(r);
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
