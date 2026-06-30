import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readArray, readTupleNamed } from "../src/readers/composite.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt8 } from "../src/readers/integers.js";
import { readNested } from "../src/readers/nested.js";
import { readString } from "../src/readers/strings.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

/**
 * `Nested(...)` has no wire format of its own:
 * - With the default `flatten_nested=1`, a `Nested(a T1, b T2)` column expands
 *   into separate columns `a Array(T1)`, `b Array(T2)` — decode each with
 *   readArray.
 * - With `flatten_nested=0`, the column is `Array(Tuple(a T1, b T2))` — decode
 *   with readArray + readTupleNamed (verified byte-identical to a real Nested
 *   column).
 *
 * Either way it reuses existing readers; there is no dedicated Nested reader.
 */
describe("Nested (decode as Array(Tuple(...)))", () => {
  it("decodes a Nested column as an array of named rows", async () => {
    // Byte-identical to `Nested(x UInt8, y String)` under flatten_nested=0.
    const r = await reader(
      "CAST([(1, 'a'), (2, 'b')] AS Array(Tuple(x UInt8, y String)))",
    );
    // readNested is the thin alias readArray(readTupleNamed(...)).
    const rows = readNested({ x: readUInt8, y: readString })(r);
    expect(rows).toEqual([
      { x: 1, y: "a" },
      { x: 2, y: "b" },
    ]);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST([(1, 'a'), (2, 'b')] AS Array(Tuple(x UInt8, y String))) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readArray(readTupleNamed({ x: readUInt8, y: readString }))(r);
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
