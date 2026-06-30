import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readGeometry } from "../src/readers/geo.js";

// Geometry's variant has "similar" alternatives (LineString/Ring), so the type
// needs allow_suspicious_variant_types; the value still casts through a geo type.
async function reader(expr: string): Promise<Cursor> {
  return new Cursor(
    await query(
      `SELECT ${expr} SETTINGS allow_suspicious_variant_types = 1 FORMAT RowBinary`,
    ),
  );
}

describe("readGeometry", () => {
  it("decodes a Point (discriminant 3)", async () => {
    const r = await reader("CAST(CAST((1.5, 2.5) AS Point) AS Geometry)");
    expect(readGeometry(r)).toEqual([1.5, 2.5]);
  });

  it("decodes a LineString (discriminant 0)", async () => {
    const r = await reader(
      "CAST(CAST([(0, 0), (1, 2)] AS LineString) AS Geometry)",
    );
    expect(readGeometry(r)).toEqual([
      [0, 0],
      [1, 2],
    ]);
  });

  it("decodes a MultiPolygon (discriminant 2)", async () => {
    const r = await reader(
      "CAST(CAST([[[(0, 0), (1, 0), (1, 1)]]] AS MultiPolygon) AS Geometry)",
    );
    expect(readGeometry(r)).toEqual([
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      ],
    ]);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST(CAST((1.5, 2.5) AS Point) AS Geometry) SETTINGS allow_suspicious_variant_types = 1 FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readGeometry(r);
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
