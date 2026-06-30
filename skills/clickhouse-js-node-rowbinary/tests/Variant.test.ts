import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readVariant } from "../src/readers/composite.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readFloat64 } from "../src/readers/floats.js";
import { readUInt64, readUInt8 } from "../src/readers/integers.js";
import { readString } from "../src/readers/strings.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(
    await query(
      `SELECT ${expr} SETTINGS allow_experimental_variant_type = 1 FORMAT RowBinary`,
    ),
  );
}

describe("readVariant", () => {
  // Variant(UInt8, String) types sort to ["String", "UInt8"], so the readers
  // are listed in that sorted order: String first (discriminant 0), UInt8 (1).
  it("picks the alternative by sorted-order discriminant (UInt8 = 1)", async () => {
    const r = await reader("CAST(42 AS Variant(UInt8, String))");
    expect(readVariant([readString, readUInt8])(r)).toBe(42);
  });

  it("picks the String alternative (discriminant 0)", async () => {
    const r = await reader("CAST('hi' AS Variant(UInt8, String))");
    expect(readVariant([readString, readUInt8])(r)).toBe("hi");
  });

  it("decodes NULL (discriminant 0xFF)", async () => {
    const r = await reader("CAST(NULL AS Variant(UInt8, String))");
    expect(readVariant([readString, readUInt8])(r)).toBeNull();
    expect(r.pos).toBe(1);
  });

  // Three alternatives sort to [Float64, String, UInt64] -> discriminants 0,1,2.
  it("handles three sorted alternatives", async () => {
    const t = "Variant(Float64, String, UInt64)";

    const a = await reader(`CAST(toUInt64(9) AS ${t})`);
    expect(readVariant([readFloat64, readString, readUInt64])(a)).toBe(9n); // discriminant 2

    const b = await reader(`CAST(toFloat64(1.5) AS ${t})`);
    expect(readVariant([readFloat64, readString, readUInt64])(b)).toBe(1.5); // discriminant 0
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST(42 AS Variant(UInt8, String)) SETTINGS allow_experimental_variant_type = 1 FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readVariant([readString, readUInt8])(r);
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
