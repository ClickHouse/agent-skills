import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readNullable, readTuple } from "../src/readers/composite.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt32, readUInt8 } from "../src/readers/integers.js";
import { readString } from "../src/readers/strings.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readTuple", () => {
  it("decodes heterogeneous elements back-to-back (no count)", async () => {
    const r = await reader("CAST((42, 'hi') AS Tuple(UInt32, String))");
    const t = readTuple([readUInt32, readString])(r);
    expect(t).toEqual([42, "hi"]);
    expect(r.pos).toBe(7); // 4 (UInt32) + 1 (len) + 2 ("hi")
  });

  // Composes with Nullable: (1, NULL) -> bytes 01 01.
  it("composes with Nullable elements", async () => {
    const r = await reader("CAST((1, NULL) AS Tuple(UInt8, Nullable(UInt8)))");
    const t = readTuple([readUInt8, readNullable(readUInt8)])(r);
    expect(t).toEqual([1, null]);
    expect(r.pos).toBe(2);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST((1, 'x') AS Tuple(UInt8, String)) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readTuple([readUInt8, readString])(r);
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
