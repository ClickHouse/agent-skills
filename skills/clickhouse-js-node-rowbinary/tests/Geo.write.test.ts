import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { encode } from "./encode.js";
import { Sink } from "../src/writers/core.js";
import {
  writePoint,
  writeRing,
  writeLineString,
  writePolygon,
  writeMultiLineString,
  writeMultiPolygon,
  writeGeometry,
} from "../src/writers/geo.js";
import { type Point } from "../src/readers/geo.js";

const ring: Point[] = [
  [0, 0],
  [1, 2],
];
const polygon: Point[][] = [
  [
    [0, 0],
    [1, 0],
    [1, 1],
  ],
];

describe("geo writers", () => {
  it("encodes a Point", async () =>
    expect(encode(writePoint, [1.5, 2.5])).toEqual(
      await query("SELECT CAST((1.5, 2.5) AS Point) FORMAT RowBinary"),
    ));
  it("encodes a Ring", async () =>
    expect(encode(writeRing, ring)).toEqual(
      await query("SELECT CAST([(0, 0), (1, 2)] AS Ring) FORMAT RowBinary"),
    ));
  it("encodes a LineString", async () =>
    expect(encode(writeLineString, ring)).toEqual(
      await query(
        "SELECT CAST([(0, 0), (1, 2)] AS LineString) FORMAT RowBinary",
      ),
    ));
  it("encodes a Polygon", async () =>
    expect(encode(writePolygon, polygon)).toEqual(
      await query(
        "SELECT CAST([[(0, 0), (1, 0), (1, 1)]] AS Polygon) FORMAT RowBinary",
      ),
    ));
  it("encodes a MultiLineString", async () =>
    expect(
      encode(writeMultiLineString, [
        [
          [0, 0],
          [1, 2],
        ],
        [[3, 4]],
      ]),
    ).toEqual(
      await query(
        "SELECT CAST([[(0, 0), (1, 2)], [(3, 4)]] AS MultiLineString) FORMAT RowBinary",
      ),
    ));
  it("encodes a MultiPolygon", async () =>
    expect(encode(writeMultiPolygon, [polygon])).toEqual(
      await query(
        "SELECT CAST([[[(0, 0), (1, 0), (1, 1)]]] AS MultiPolygon) FORMAT RowBinary",
      ),
    ));
});

describe("writeGeometry", () => {
  it("encodes a Point (discriminant 3)", async () =>
    expect(encode(writeGeometry, [3, [1.5, 2.5]])).toEqual(
      await query(
        "SELECT CAST(CAST((1.5, 2.5) AS Point) AS Geometry) SETTINGS allow_suspicious_variant_types = 1 FORMAT RowBinary",
      ),
    ));
  it("encodes a LineString (discriminant 0)", async () =>
    expect(encode(writeGeometry, [0, ring])).toEqual(
      await query(
        "SELECT CAST(CAST([(0, 0), (1, 2)] AS LineString) AS Geometry) SETTINGS allow_suspicious_variant_types = 1 FORMAT RowBinary",
      ),
    ));
  it("encodes a Polygon (discriminant 4)", async () =>
    expect(encode(writeGeometry, [4, polygon])).toEqual(
      await query(
        "SELECT CAST(CAST([[(0, 0), (1, 0), (1, 1)]] AS Polygon) AS Geometry) SETTINGS allow_suspicious_variant_types = 1 FORMAT RowBinary",
      ),
    ));
  it("encodes NULL as a single 0xFF byte", () =>
    expect([...encode(writeGeometry, null)]).toEqual([0xff]));

  it("throws on an unknown discriminant without writing the byte", () => {
    const sink = new Sink(Buffer.allocUnsafe(16));
    expect(() => writeGeometry(sink, [6, [1, 2]])).toThrow(RangeError);
    // The discriminant is validated before the byte is written, so a rejected
    // value leaves no partial payload behind.
    expect(sink.bytes().length).toBe(0);
  });
});
