import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readNullable, readTupleNamed } from "../src/readers/composite.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt32, readUInt8 } from "../src/readers/integers.js";
import { readString } from "../src/readers/strings.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readTupleNamed", () => {
  it("decodes a named tuple into an object (same wire as unnamed)", async () => {
    const r = await reader("CAST((42, 'hi') AS Tuple(a UInt32, b String))");
    const obj = readTupleNamed({
      a: readUInt32,
      b: readString,
    })(r);
    expect(obj).toEqual({ a: 42, b: "hi" });
    expect(r.pos).toBe(7); // 4 (UInt32) + 1 (len) + 2 ("hi")
  });

  // Keys are read in listed order; the result object carries the names.
  it("composes with Nullable and preserves field names", async () => {
    const r = await reader(
      "CAST((1, NULL) AS Tuple(id UInt8, parent Nullable(UInt8)))",
    );
    const obj = readTupleNamed({
      id: readUInt8,
      parent: readNullable(readUInt8),
    })(r);
    expect(obj).toEqual({ id: 1, parent: null });
    expect(r.pos).toBe(2);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST((1, 'x') AS Tuple(a UInt8, b String)) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readTupleNamed({ a: readUInt8, b: readString })(r);
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
