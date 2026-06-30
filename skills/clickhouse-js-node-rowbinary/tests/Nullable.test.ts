import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readNullable } from "../src/readers/composite.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt32, readUInt8 } from "../src/readers/integers.js";
import { readString } from "../src/readers/strings.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readNullable", () => {
  it("decodes a present value (flag 0 + value)", async () => {
    const r = await reader("CAST(42 AS Nullable(UInt32))");
    expect(readNullable(readUInt32)(r)).toBe(42);
    expect(r.pos).toBe(5); // 1 flag + 4 value
  });

  it("decodes NULL as the lone flag byte (no value follows)", async () => {
    const r = await reader("CAST(NULL AS Nullable(UInt32))");
    expect(readNullable(readUInt32)(r)).toBeNull();
    expect(r.pos).toBe(1); // just the flag — the inner reader must not run
  });

  // Framing across rows: NULL then 1 -> bytes 01 00 01.
  it("keeps the cursor aligned across NULL and non-NULL rows", async () => {
    const r = await reader(
      "CAST(number = 0 ? NULL : number AS Nullable(UInt8)) FROM numbers(2)",
    );
    expect(readNullable(readUInt8)(r)).toBeNull();
    expect(r.pos).toBe(1);
    expect(readNullable(readUInt8)(r)).toBe(1);
    expect(r.pos).toBe(3);
  });

  // A variable-length inner type: the inner reader must not run on NULL.
  it("works with a variable-length inner type (String)", async () => {
    const r = await reader("CAST('hi' AS Nullable(String))");
    expect(readNullable(readString)(r)).toBe("hi");
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST(42 AS Nullable(UInt32)) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readNullable(readUInt32)(r);
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
