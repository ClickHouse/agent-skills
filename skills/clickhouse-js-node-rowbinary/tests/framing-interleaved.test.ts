import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import {
  readArray,
  readMap,
  readNullable,
  readTuple,
  readVariant,
} from "../src/readers/composite.js";
import { Cursor } from "../src/readers/core.js";
import { readDynamic } from "../src/readers/dynamic.js";
import { readInt32, readUInt8 } from "../src/readers/integers.js";
import { readJSON } from "../src/readers/json.js";
import { readString } from "../src/readers/strings.js";

/**
 * Interleaving framing tests: TWO variable-length / self-describing columns are
 * placed adjacent between the Int32 sentinels — `i32(LEAD), X, Y, i32(TRAIL)`.
 *
 * The point is the X→Y boundary: there is NO sentinel between them, so if X's
 * reader stops one byte early or late, Y decodes from the wrong offset (wrong
 * value) AND the trailing sentinel is wrong too. Pairing two variadic types
 * (Array, Map, Tuple, Nullable, Variant, Dynamic, JSON) — especially two
 * self-describing ones back-to-back, and 1-byte NULL values next to them — is
 * the case most likely to expose an off-by-one in a buggy reader.
 */
const LEAD = 123456789;
const TRAIL = 987654321;

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

/** Build `i32(LEAD), X, Y, i32(TRAIL)` and return a reader over the bytes. */
async function framed(exprX: string, exprY: string): Promise<Cursor> {
  const sql =
    `SELECT toInt32(${LEAD}) AS a, ${exprX} AS x, ${exprY} AS y,` +
    ` toInt32(${TRAIL}) AS b SETTINGS ${SETTINGS} FORMAT RowBinary`;
  return new Cursor(await query(sql));
}

// Inner-reader shorthands, as in framing-nested.test.ts.
const u8 = readUInt8;
const str = readString;
// Variant(UInt8, String) sorts to [String(0), UInt8(1)].
const variantU8Str = readVariant([readString, readUInt8]);

describe("framing (interleaved): i32, X, Y, i32 — the X→Y boundary must be exact", () => {
  describe("X = Array(UInt8)", () => {
    it("Array, Array", async () => {
      const r = await framed("[1, 2, 3]::Array(UInt8)", "[4, 5]::Array(UInt8)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(u8)(r)).toEqual([1, 2, 3]);
      expect(readArray(u8)(r)).toEqual([4, 5]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Array, Map", async () => {
      const r = await framed(
        "[1, 2, 3]::Array(UInt8)",
        "map('a', 1, 'b', 2)::Map(String, UInt8)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(u8)(r)).toEqual([1, 2, 3]);
      expect(readMap(str, u8)(r)).toEqual(
        new Map([
          ["a", 1],
          ["b", 2],
        ]),
      );
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Array, Variant", async () => {
      const r = await framed(
        "[1, 2, 3]::Array(UInt8)",
        "'hi'::Variant(UInt8, String)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(u8)(r)).toEqual([1, 2, 3]);
      expect(readVariant([readString, readUInt8])(r)).toBe("hi");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Array, Dynamic", async () => {
      const r = await framed("[1, 2, 3]::Array(UInt8)", "toInt32(7)::Dynamic");
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(u8)(r)).toEqual([1, 2, 3]);
      expect(readDynamic(r)).toBe(7);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Array, JSON", async () => {
      const r = await framed("[1, 2, 3]::Array(UInt8)", `'{"a":1}'::JSON`);
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(u8)(r)).toEqual([1, 2, 3]);
      expect(readJSON(r)).toEqual(new Map([["a", 1n]]));
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Array, Nullable (NULL)", async () => {
      const r = await framed(
        "[1, 2, 3]::Array(UInt8)",
        "CAST(NULL AS Nullable(String))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(u8)(r)).toEqual([1, 2, 3]);
      expect(readNullable(str)(r)).toBeNull();
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("empty Array, Array — the empty array is a lone count byte", async () => {
      const r = await framed("[]::Array(UInt8)", "[9]::Array(UInt8)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(u8)(r)).toEqual([]);
      expect(readArray(u8)(r)).toEqual([9]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("X = Map(String, UInt8)", () => {
    it("Map, Array", async () => {
      const r = await framed(
        "map('a', 1)::Map(String, UInt8)",
        "[7, 8]::Array(UInt8)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readMap(str, u8)(r)).toEqual(new Map([["a", 1]]));
      expect(readArray(u8)(r)).toEqual([7, 8]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Map, Variant", async () => {
      const r = await framed(
        "map('a', 1)::Map(String, UInt8)",
        "42::Variant(UInt8, String)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readMap(str, u8)(r)).toEqual(new Map([["a", 1]]));
      expect(variantU8Str(r)).toBe(42);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Map, Dynamic", async () => {
      const r = await framed(
        "map('a', 1)::Map(String, UInt8)",
        "'hi'::Dynamic",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readMap(str, u8)(r)).toEqual(new Map([["a", 1]]));
      expect(readDynamic(r)).toBe("hi");
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("X = Tuple", () => {
    it("Tuple, Tuple", async () => {
      const r = await framed(
        "(1, 'x')::Tuple(UInt8, String)",
        "(2, 'y')::Tuple(UInt8, String)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readTuple([u8, str])(r)).toEqual([1, "x"]);
      expect(readTuple([u8, str])(r)).toEqual([2, "y"]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Tuple, Variant", async () => {
      const r = await framed(
        "(1, 'x')::Tuple(UInt8, String)",
        "'z'::Variant(UInt8, String)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readTuple([u8, str])(r)).toEqual([1, "x"]);
      expect(variantU8Str(r)).toBe("z");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Tuple, Dynamic", async () => {
      const r = await framed(
        "(1, 'x')::Tuple(UInt8, String)",
        "toInt32(9)::Dynamic",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readTuple([u8, str])(r)).toEqual([1, "x"]);
      expect(readDynamic(r)).toBe(9);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("X = Variant", () => {
    it("Variant, Variant", async () => {
      const r = await framed(
        "42::Variant(UInt8, String)",
        "'hi'::Variant(UInt8, String)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(variantU8Str(r)).toBe(42);
      expect(variantU8Str(r)).toBe("hi");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Variant (NULL), Variant — the NULL is a lone discriminant byte", async () => {
      const r = await framed(
        "NULL::Variant(UInt8, String)",
        "7::Variant(UInt8, String)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(variantU8Str(r)).toBeNull();
      expect(variantU8Str(r)).toBe(7);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Variant, Dynamic", async () => {
      const r = await framed(
        "'hi'::Variant(UInt8, String)",
        "toInt32(7)::Dynamic",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(variantU8Str(r)).toBe("hi");
      expect(readDynamic(r)).toBe(7);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Variant, Array", async () => {
      const r = await framed(
        "42::Variant(UInt8, String)",
        "[1, 2]::Array(UInt8)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(variantU8Str(r)).toBe(42);
      expect(readArray(u8)(r)).toEqual([1, 2]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("X = Dynamic", () => {
    it("Dynamic, Dynamic", async () => {
      const r = await framed("toInt32(7)::Dynamic", "'hi'::Dynamic");
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toBe(7);
      expect(readDynamic(r)).toBe("hi");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Dynamic (NULL), Dynamic — the NULL is a lone Nothing tag", async () => {
      const r = await framed("NULL::Dynamic", "toInt32(7)::Dynamic");
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toBeNull();
      expect(readDynamic(r)).toBe(7);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Dynamic, Variant", async () => {
      const r = await framed(
        "toInt32(7)::Dynamic",
        "'hi'::Variant(UInt8, String)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toBe(7);
      expect(variantU8Str(r)).toBe("hi");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Dynamic, JSON", async () => {
      const r = await framed("toInt32(7)::Dynamic", `'{"a":1}'::JSON`);
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toBe(7);
      expect(readJSON(r)).toEqual(new Map([["a", 1n]]));
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Dynamic (Array), Array", async () => {
      const r = await framed(
        "[1, 2, 3]::Array(UInt8)::Dynamic",
        "[4, 5]::Array(UInt8)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toEqual([1, 2, 3]);
      expect(readArray(u8)(r)).toEqual([4, 5]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("X = JSON", () => {
    it("JSON, JSON", async () => {
      const r = await framed(`'{"a":1}'::JSON`, `'{"b":2}'::JSON`);
      expect(readInt32(r)).toBe(LEAD);
      expect(readJSON(r)).toEqual(new Map([["a", 1n]]));
      expect(readJSON(r)).toEqual(new Map([["b", 2n]]));
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("JSON, Dynamic", async () => {
      const r = await framed(`'{"a":1}'::JSON`, "toInt32(7)::Dynamic");
      expect(readInt32(r)).toBe(LEAD);
      expect(readJSON(r)).toEqual(new Map([["a", 1n]]));
      expect(readDynamic(r)).toBe(7);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("JSON, Array", async () => {
      const r = await framed(`'{"a":1}'::JSON`, "[1, 2]::Array(UInt8)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readJSON(r)).toEqual(new Map([["a", 1n]]));
      expect(readArray(u8)(r)).toEqual([1, 2]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("X = Nullable (1-byte boundaries)", () => {
    it("Nullable (NULL), Nullable (value)", async () => {
      const r = await framed(
        "CAST(NULL AS Nullable(String))",
        "CAST('v' AS Nullable(String))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readNullable(str)(r)).toBeNull();
      expect(readNullable(str)(r)).toBe("v");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Nullable (value), Variant", async () => {
      const r = await framed(
        "CAST('v' AS Nullable(String))",
        "42::Variant(UInt8, String)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readNullable(str)(r)).toBe("v");
      expect(variantU8Str(r)).toBe(42);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Nullable (NULL), Dynamic", async () => {
      const r = await framed(
        "CAST(NULL AS Nullable(String))",
        "toInt32(7)::Dynamic",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readNullable(str)(r)).toBeNull();
      expect(readDynamic(r)).toBe(7);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });
});
