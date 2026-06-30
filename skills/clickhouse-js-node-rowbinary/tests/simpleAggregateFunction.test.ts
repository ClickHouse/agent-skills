import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readArray } from "../src/readers/composite.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt64, readUInt8 } from "../src/readers/integers.js";
import { readSimpleAggregateFunction } from "../src/readers/simpleAggregateFunction.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

/**
 * `SimpleAggregateFunction(func, T)` is TRANSPARENT in RowBinary: the column
 * already holds a finished value of the underlying type `T` (the partial
 * aggregate of a "simple" function — sum, min, max, groupArrayArray, ... — is
 * just a value of `T`), so it is encoded byte-for-byte the same as `T`. There
 * is no dedicated reader: decode the inner `T` directly.
 *
 * Do NOT confuse it with `AggregateFunction(func, T)`, whose value is an opaque
 * serialized aggregation STATE with a function-specific binary layout.
 */
describe("SimpleAggregateFunction (transparent — decode as the inner type)", () => {
  it("SimpleAggregateFunction(sum, UInt64) decodes exactly like UInt64", async () => {
    const r = await reader("CAST(42 AS SimpleAggregateFunction(sum, UInt64))");
    // readSimpleAggregateFunction is the identity combinator: just readUInt64.
    expect(readSimpleAggregateFunction(readUInt64)(r)).toBe(42n); // identical bytes to UInt64 42: 2a 00 00 00 00 00 00 00
    expect(r.pos).toBe(8);
  });

  it("SimpleAggregateFunction(groupArrayArray, Array(UInt8)) is just Array(UInt8)", async () => {
    const r = await reader(
      "CAST([1, 2, 3] AS SimpleAggregateFunction(groupArrayArray, Array(UInt8)))",
    );
    expect(readArray(readUInt8)(r)).toEqual([1, 2, 3]); // varint len 03, then bytes
    expect(r.pos).toBe(4);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST(42 AS SimpleAggregateFunction(sum, UInt64)) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readUInt64(r);
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
