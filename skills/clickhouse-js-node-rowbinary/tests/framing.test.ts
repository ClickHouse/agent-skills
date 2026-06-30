import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readBool } from "../src/readers/bool.js";
import {
  readArray,
  readMap,
  readNullable,
  readQBit,
  readTuple,
  readTupleNamed,
  readVariant,
} from "../src/readers/composite.js";
import { Cursor } from "../src/readers/core.js";
import {
  readDate,
  readDate32,
  readDateTime,
  readDateTime64,
} from "../src/readers/datetime.js";
import {
  readDecimal128,
  readDecimal256,
  readDecimal32,
  readDecimal64,
} from "../src/readers/decimals.js";
import { readDynamic } from "../src/readers/dynamic.js";
import { readEnum16, readEnum8 } from "../src/readers/enums.js";
import {
  readBFloat16,
  readFloat32,
  readFloat64,
} from "../src/readers/floats.js";
import {
  readGeometry,
  readLineString,
  readMultiLineString,
  readMultiPolygon,
  readPoint,
  readPolygon,
  readRing,
} from "../src/readers/geo.js";
import {
  readInt128,
  readInt16,
  readInt256,
  readInt32,
  readInt64,
  readInt8,
  readUInt128,
  readUInt16,
  readUInt256,
  readUInt32,
  readUInt64,
  readUInt8,
} from "../src/readers/integers.js";
import { readInterval } from "../src/readers/interval.js";
import {
  formatIPv4,
  formatIPv6,
  readIPv4,
  readIPv6,
} from "../src/readers/ip.js";
import { readJSON } from "../src/readers/json.js";
import { readFixedString, readString } from "../src/readers/strings.js";
import { readTime, readTime64 } from "../src/readers/time.js";
import { formatUUID, readUUID } from "../src/readers/uuid.js";

/**
 * Framing tests: every type is placed as the MIDDLE column between two distinct
 * Int32 sentinels — `i32(LEAD), X, i32(TRAIL)`. Reading the trailing sentinel
 * correctly only works if X's reader consumed EXACTLY its bytes: one byte short
 * or long and the final `readInt32()` returns garbage instead of TRAIL. So each
 * test reads LEAD, then X, then asserts TRAIL — a tight check that the middle
 * reader stops on the dot.
 *
 * The NULL / empty cases (Nullable null, Variant null, Dynamic null, empty
 * Array) are the sharpest: the value is a single byte, so an over-read is caught
 * immediately by the sentinel.
 */
const LEAD = 123456789;
const TRAIL = 987654321;

/**
 * Every experimental / suspicious type flag this skill targets, enabled for all
 * queries. It is fine to turn everything on unconditionally here — the skill is
 * meant to read whatever a server emits — so each case just names its type and
 * shares this one settings string.
 */
const SETTINGS = [
  "enable_time_time64_type = 1",
  "allow_experimental_variant_type = 1",
  "allow_suspicious_variant_types = 1",
  "allow_experimental_dynamic_type = 1",
  "allow_experimental_json_type = 1",
  "enable_json_type = 1",
  "allow_experimental_qbit_type = 1",
  "allow_suspicious_low_cardinality_types = 1",
].join(", ");

/**
 * Build a `i32(LEAD), X, i32(TRAIL)` row, run it, and return a fresh reader over
 * the bytes. Each test reads the leading sentinel, X, and the trailing sentinel
 * itself.
 */
async function framed(expr: string): Promise<Cursor> {
  const sql =
    `SELECT toInt32(${LEAD}) AS a, ${expr} AS x, toInt32(${TRAIL}) AS b` +
    ` SETTINGS ${SETTINGS} FORMAT RowBinary`;
  return new Cursor(await query(sql));
}

describe("framing: i32, X, i32 — the middle reader must stop at the exact byte", () => {
  describe("Integers", () => {
    it("Int8", async () => {
      const r = await framed("toInt8(-5)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readInt8(r)).toBe(-5);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Int16", async () => {
      const r = await framed("toInt16(-12345)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readInt16(r)).toBe(-12345);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Int32", async () => {
      const r = await framed("toInt32(-70000)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readInt32(r)).toBe(-70000);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Int64", async () => {
      const r = await framed("toInt64(-5)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readInt64(r)).toBe(-5n);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Int128", async () => {
      const r = await framed("toInt128(-5)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readInt128(r)).toBe(-5n);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Int256", async () => {
      const r = await framed("toInt256(-5)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readInt256(r)).toBe(-5n);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("UInt8", async () => {
      const r = await framed("toUInt8(200)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readUInt8(r)).toBe(200);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("UInt16", async () => {
      const r = await framed("toUInt16(60000)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readUInt16(r)).toBe(60000);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("UInt32", async () => {
      const r = await framed("toUInt32(4000000000)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readUInt32(r)).toBe(4000000000);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("UInt64", async () => {
      const r = await framed("toUInt64(5)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readUInt64(r)).toBe(5n);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("UInt128", async () => {
      const r = await framed("toUInt128(5)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readUInt128(r)).toBe(5n);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("UInt256", async () => {
      const r = await framed("toUInt256(5)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readUInt256(r)).toBe(5n);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Floats", () => {
    it("Float32", async () => {
      const r = await framed("toFloat32(1.5)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readFloat32(r)).toBe(1.5);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Float64", async () => {
      const r = await framed("toFloat64(1.5)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readFloat64(r)).toBe(1.5);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("BFloat16", async () => {
      const r = await framed("toBFloat16(1.5)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readBFloat16(r)).toBe(1.5);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Decimals", () => {
    it("Decimal32", async () => {
      const r = await framed("toDecimal32(1.5, 4)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readDecimal32(4)(r)).toEqual([15000n, 4]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Decimal64", async () => {
      const r = await framed("toDecimal64(-12.34, 2)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readDecimal64(2)(r)).toEqual([-1234n, 2]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Decimal128", async () => {
      const r = await framed("toDecimal128(1.5, 4)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readDecimal128(4)(r)).toEqual([15000n, 4]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Decimal256", async () => {
      const r = await framed("toDecimal256(1.5, 4)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readDecimal256(4)(r)).toEqual([15000n, 4]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Bool and strings", () => {
    it("Bool", async () => {
      const r = await framed("true");
      expect(readInt32(r)).toBe(LEAD);
      expect(readBool(r)).toBe(true);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("String", async () => {
      const r = await framed("'hello'");
      expect(readInt32(r)).toBe(LEAD);
      expect(readString(r)).toBe("hello");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("FixedString (NUL padding counts toward the fixed width)", async () => {
      const r = await framed("CAST('ab' AS FixedString(5))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readFixedString(5)(r)).toBe("ab\x00\x00\x00");
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Dates and times", () => {
    it("Date", async () => {
      const r = await framed("toDate('2021-03-15')");
      expect(readInt32(r)).toBe(LEAD);
      expect(readDate(r).toISOString()).toBe("2021-03-15T00:00:00.000Z");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Date32", async () => {
      const r = await framed("toDate32('1950-01-01')");
      expect(readInt32(r)).toBe(LEAD);
      expect(readDate32(r).toISOString()).toBe("1950-01-01T00:00:00.000Z");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("DateTime", async () => {
      const r = await framed("toDateTime('2021-01-01 00:00:00', 'UTC')");
      expect(readInt32(r)).toBe(LEAD);
      expect(readDateTime(r).getTime()).toBe(1609459200000);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("DateTime64", async () => {
      const r = await framed(
        "toDateTime64('2021-01-01 00:00:00.123', 3, 'UTC')",
      );
      expect(readInt32(r)).toBe(LEAD);
      const [d, n] = readDateTime64(3)(r);
      expect(d.toISOString()).toBe("2021-01-01T00:00:00.000Z");
      expect(n).toBe(123_000_000);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Time", async () => {
      const r = await framed("CAST('12:34:56' AS Time)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readTime(r)).toBe(45296);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Time64", async () => {
      const r = await framed("toTime64('12:34:56.123', 3)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readTime64(3)(r)).toEqual([45296123n, 3]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("UUID and networking", () => {
    it("UUID", async () => {
      const r = await framed("toUUID('61f0c404-5cb3-11e7-907b-a6006ad3dba0')");
      expect(readInt32(r)).toBe(LEAD);
      expect(formatUUID(readUUID(r))).toBe(
        "61f0c404-5cb3-11e7-907b-a6006ad3dba0",
      );
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("IPv4", async () => {
      const r = await framed("toIPv4('1.2.3.4')");
      expect(readInt32(r)).toBe(LEAD);
      expect(formatIPv4(readIPv4(r))).toBe("1.2.3.4");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("IPv6", async () => {
      const r = await framed("toIPv6('2001:db8::1')");
      expect(readInt32(r)).toBe(LEAD);
      expect(formatIPv6(readIPv6(r))).toBe("2001:db8::1");
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Enums", () => {
    it("Enum8", async () => {
      const r = await framed("CAST('b' AS Enum8('a' = 1, 'b' = 2))");
      expect(readInt32(r)).toBe(LEAD);
      expect(
        readEnum8(
          new Map([
            [1, "a"],
            [2, "b"],
          ]),
        )(r),
      ).toBe("b");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Enum16", async () => {
      const r = await framed("CAST('big' AS Enum16('small' = 1, 'big' = 300))");
      expect(readInt32(r)).toBe(LEAD);
      expect(
        readEnum16(
          new Map([
            [1, "small"],
            [300, "big"],
          ]),
        )(r),
      ).toBe("big");
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Composite and wrappers", () => {
    it("Nullable (value present)", async () => {
      const r = await framed("CAST(7 AS Nullable(UInt8))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readNullable(readUInt8)(r)).toBe(7);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Nullable (NULL — a single flag byte)", async () => {
      const r = await framed("CAST(NULL AS Nullable(UInt8))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readNullable(readUInt8)(r)).toBeNull();
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("LowCardinality(String)", async () => {
      const r = await framed("CAST('x' AS LowCardinality(String))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readString(r)).toBe("x");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Array(UInt8)", async () => {
      const r = await framed("CAST([1, 2, 3] AS Array(UInt8))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(readUInt8)(r)).toEqual([1, 2, 3]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Array empty (a single count byte)", async () => {
      const r = await framed("CAST([] AS Array(UInt8))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(readUInt8)(r)).toEqual([]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Tuple", async () => {
      const r = await framed("CAST((1, 'x') AS Tuple(UInt8, String))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readTuple([readUInt8, readString])(r)).toEqual([1, "x"]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Tuple named", async () => {
      const r = await framed("CAST((1, 'x') AS Tuple(a UInt8, b String))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readTupleNamed({ a: readUInt8, b: readString })(r)).toEqual({
        a: 1,
        b: "x",
      });
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Map", async () => {
      const r = await framed("CAST(map('a', 1, 'b', 2) AS Map(String, UInt8))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readMap(readString, readUInt8)(r)).toEqual(
        new Map([
          ["a", 1],
          ["b", 2],
        ]),
      );
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Nested", async () => {
      const r = await framed(
        "CAST([(1, 'x'), (2, 'y')] AS Nested(a UInt8, b String))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(
        readArray(readTupleNamed({ a: readUInt8, b: readString }))(r),
      ).toEqual([
        { a: 1, b: "x" },
        { a: 2, b: "y" },
      ]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Geo", () => {
    it("Point", async () => {
      const r = await framed("CAST((1.5, 2.5) AS Point)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readPoint(r)).toEqual([1.5, 2.5]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Ring", async () => {
      const r = await framed("CAST([(0, 0), (1, 2)] AS Ring)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readRing(r)).toEqual([
        [0, 0],
        [1, 2],
      ]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("LineString", async () => {
      const r = await framed("CAST([(3, 4), (5, 6)] AS LineString)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readLineString(r)).toEqual([
        [3, 4],
        [5, 6],
      ]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("MultiLineString", async () => {
      const r = await framed("CAST([[(0, 0), (1, 1)]] AS MultiLineString)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readMultiLineString(r)).toEqual([
        [
          [0, 0],
          [1, 1],
        ],
      ]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Polygon", async () => {
      const r = await framed("CAST([[(0, 0), (1, 0), (1, 1)]] AS Polygon)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readPolygon(r)).toEqual([
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      ]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("MultiPolygon", async () => {
      const r = await framed(
        "CAST([[[(0, 0), (1, 0), (1, 1)]]] AS MultiPolygon)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readMultiPolygon(r)).toEqual([
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
        ],
      ]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Geometry", async () => {
      const r = await framed("CAST(CAST((1.5, 2.5) AS Point) AS Geometry)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readGeometry(r)).toEqual([1.5, 2.5]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Intervals", () => {
    it("Interval", async () => {
      const r = await framed("toIntervalSecond(5)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readInterval(r)).toBe(5n);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Variant", () => {
    it("Variant (value)", async () => {
      const r = await framed("CAST(42 AS Variant(UInt8, String))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readVariant([readString, readUInt8])(r)).toBe(42);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Variant (NULL — a single discriminant byte)", async () => {
      const r = await framed("CAST(NULL AS Variant(UInt8, String))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readVariant([readString, readUInt8])(r)).toBeNull();
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Dynamic", () => {
    it("Dynamic (scalar)", async () => {
      const r = await framed("CAST(toUInt64(42) AS Dynamic)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toBe(42n);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Dynamic (NULL — a single Nothing tag)", async () => {
      const r = await framed("CAST(NULL AS Dynamic)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toBeNull();
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Dynamic (Array)", async () => {
      const r = await framed("CAST([1, 2, 3]::Array(UInt8) AS Dynamic)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toEqual([1, 2, 3]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("JSON", () => {
    it("JSON", async () => {
      const r = await framed(`'{"a":1}'::JSON`);
      expect(readInt32(r)).toBe(LEAD);
      expect(readJSON(r)).toEqual(new Map([["a", 1n]]));
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Aggregate state", () => {
    it("SimpleAggregateFunction (transparent → inner UInt64)", async () => {
      const r = await framed(
        "CAST(42 AS SimpleAggregateFunction(sum, UInt64))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readUInt64(r)).toBe(42n);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("AggregateFunction (sumState: known UInt64 layout)", async () => {
      const r = await framed("sumState(toUInt64(42))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readUInt64(r)).toBe(42n);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Vector search", () => {
    it("QBit", async () => {
      const r = await framed("CAST([1.0, 2.0] AS QBit(Float32, 2))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readQBit(readFloat32)(r)).toEqual([1, 2]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Misc", () => {
    it("Nothing (empty Array(Nothing) — element reader never runs)", async () => {
      const r = await framed("[]");
      expect(readInt32(r)).toBe(LEAD);
      expect(
        readArray(() => {
          throw new Error("unreachable");
        })(r),
      ).toEqual([]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });
});
