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
 * Framing tests for NESTED self-describing / variable-length types — the place
 * where a buggy reader is most likely to desync. Each value combines two types
 * that carry an internal type description or a variable length (`Dynamic`,
 * `Variant`, `JSON`, `Array`, `Map`, `Tuple`, `Nullable`), so the boundary
 * between inner readers is "blurry": a reader that miscounts one element's bytes
 * silently shifts everything after it.
 *
 * Same harness as framing.test.ts: the value sits as the MIDDLE column between
 * two distinct Int32 sentinels `i32(LEAD), X, i32(TRAIL)`. Reading TRAIL back
 * correctly is only possible if X consumed EXACTLY its bytes. The adjacency
 * cases (Tuple of two variable things, NULL/empty inners) are the sharpest.
 */
const LEAD = 123456789;
const TRAIL = 987654321;

// Every experimental / suspicious flag on, as in framing.test.ts.
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

async function framed(expr: string): Promise<Cursor> {
  const sql =
    `SELECT toInt32(${LEAD}) AS a, ${expr} AS x, toInt32(${TRAIL}) AS b` +
    ` SETTINGS ${SETTINGS} FORMAT RowBinary`;
  return new Cursor(await query(sql));
}

// Shared inner readers, written once so the nesting reads cleanly below.
const u8 = readUInt8;
const str = readString;
// Variant(UInt8, String) sorts to [String(0), UInt8(1)].
const variantU8Str = readVariant([readString, readUInt8]);

describe("framing (nested): two self-describing / variable types — boundaries stay exact", () => {
  describe("Array of a variable / self-describing inner", () => {
    it("Array(Variant(UInt8, String)) with a NULL element", async () => {
      const r = await framed(
        "[42::Variant(UInt8, String), 'hi'::Variant(UInt8, String), NULL::Variant(UInt8, String)]::Array(Variant(UInt8, String))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(variantU8Str)(r)).toEqual([42, "hi", null]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Array(Dynamic)", async () => {
      const r = await framed("['x'::Dynamic, 'y'::Dynamic]::Array(Dynamic)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(readDynamic)(r)).toEqual(["x", "y"]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Array(Nullable(String)) with a hole", async () => {
      const r = await framed("['a', NULL, 'b']::Array(Nullable(String))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(readNullable(str))(r)).toEqual(["a", null, "b"]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Array(Array(String)) — variable-length inner arrays", async () => {
      const r = await framed("[['a', 'b'], ['c']]::Array(Array(String))");
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(readArray(str))(r)).toEqual([["a", "b"], ["c"]]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Array(Map(String, UInt8))", async () => {
      const r = await framed(
        "[map('a', 1), map('b', 2)]::Array(Map(String, UInt8))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(readMap(str, u8))(r)).toEqual([
        new Map([["a", 1]]),
        new Map([["b", 2]]),
      ]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Array(Tuple(UInt8, String))", async () => {
      const r = await framed(
        "[(1, 'x'), (2, 'y')]::Array(Tuple(UInt8, String))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readArray(readTuple([u8, str]))(r)).toEqual([
        [1, "x"],
        [2, "y"],
      ]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Map(String, variable value)", () => {
    it("Map(String, Variant(UInt8, String))", async () => {
      const r = await framed(
        "map('a', 42::Variant(UInt8, String), 'b', 'hi'::Variant(UInt8, String))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readMap(str, variantU8Str)(r)).toEqual(
        new Map<string, unknown>([
          ["a", 42],
          ["b", "hi"],
        ]),
      );
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Map(String, Dynamic) with mixed value types", async () => {
      const r = await framed(
        "map('a', toInt32(7)::Dynamic, 'b', 'hi'::Dynamic)::Map(String, Dynamic)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readMap(str, readDynamic)(r)).toEqual(
        new Map<string, unknown>([
          ["a", 7],
          ["b", "hi"],
        ]),
      );
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Map(String, Array(UInt8))", async () => {
      const r = await framed(
        "map('x', [1, 2], 'y', [3])::Map(String, Array(UInt8))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readMap(str, readArray(u8))(r)).toEqual(
        new Map([
          ["x", [1, 2]],
          ["y", [3]],
        ]),
      );
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Map(String, Nullable(UInt8)) with a NULL value", async () => {
      const r = await framed(
        "map('a', 1, 'b', NULL)::Map(String, Nullable(UInt8))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readMap(str, readNullable(u8))(r)).toEqual(
        new Map<string, number | null>([
          ["a", 1],
          ["b", null],
        ]),
      );
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Tuple adjacency — two variable things back-to-back", () => {
    it("Tuple(Dynamic, Dynamic)", async () => {
      const r = await framed(
        "(toInt32(7)::Dynamic, 'hi'::Dynamic)::Tuple(Dynamic, Dynamic)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readTuple([readDynamic, readDynamic])(r)).toEqual([7, "hi"]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Tuple(Dynamic, Dynamic) — first is a 1-byte NULL", async () => {
      const r = await framed(
        "(NULL::Dynamic, toInt32(9)::Dynamic)::Tuple(Dynamic, Dynamic)",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readTuple([readDynamic, readDynamic])(r)).toEqual([null, 9]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Tuple(Variant, Variant)", async () => {
      const r = await framed(
        "(42::Variant(UInt8, String), 'x'::Variant(UInt8, String))::Tuple(Variant(UInt8, String), Variant(UInt8, String))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readTuple([variantU8Str, variantU8Str])(r)).toEqual([42, "x"]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Tuple(Array(UInt8), Array(UInt8)) — two adjacent length-prefixed arrays", async () => {
      const r = await framed(
        "([1, 2], [3, 4])::Tuple(Array(UInt8), Array(UInt8))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readTuple([readArray(u8), readArray(u8)])(r)).toEqual([
        [1, 2],
        [3, 4],
      ]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Tuple(Array(UInt8), String)", async () => {
      const r = await framed("([1, 2], 'x')::Tuple(Array(UInt8), String)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readTuple([readArray(u8), str])(r)).toEqual([[1, 2], "x"]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Tuple(Nullable(String), Nullable(String)) — NULL then value", async () => {
      const r = await framed(
        "(NULL, 'x')::Tuple(Nullable(String), Nullable(String))",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readTuple([readNullable(str), readNullable(str)])(r)).toEqual([
        null,
        "x",
      ]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Variant whose active alternative is variable-length", () => {
    it("Variant(Array(UInt8), String) holding the Array (discriminant 0)", async () => {
      const r = await framed("[1, 2, 3]::Variant(Array(UInt8), String)");
      expect(readInt32(r)).toBe(LEAD);
      // sorted [Array(UInt8)(0), String(1)]
      expect(readVariant([readArray(u8), readString])(r)).toEqual([1, 2, 3]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Variant(Array(UInt8), String) holding the String (discriminant 1)", async () => {
      const r = await framed("'hi'::Variant(Array(UInt8), String)");
      expect(readInt32(r)).toBe(LEAD);
      expect(readVariant([readArray(u8), readString])(r)).toBe("hi");
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Variant(Map(String, UInt8), UInt8) holding the Map (discriminant 0)", async () => {
      const r = await framed("map('a', 1)::Variant(Map(String, UInt8), UInt8)");
      expect(readInt32(r)).toBe(LEAD);
      // sorted [Map(String, UInt8)(0), UInt8(1)]
      expect(readVariant([readMap(str, u8), readUInt8])(r)).toEqual(
        new Map([["a", 1]]),
      );
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Variant(Tuple(UInt8, String), UInt8) holding the Tuple (discriminant 0)", async () => {
      const r = await framed("(1, 'x')::Variant(Tuple(UInt8, String), UInt8)");
      expect(readInt32(r)).toBe(LEAD);
      // sorted [Tuple(UInt8, String)(0), UInt8(1)]
      expect(readVariant([readTuple([u8, str]), readUInt8])(r)).toEqual([
        1,
        "x",
      ]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("Dynamic wrapping a nested self-describing type", () => {
    it("Dynamic(Array(Variant(UInt8, String)))", async () => {
      const r = await framed(
        "[42::Variant(UInt8, String), 'hi'::Variant(UInt8, String)]::Array(Variant(UInt8, String))::Dynamic",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toEqual([42, "hi"]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Dynamic(Map(String, Variant(UInt8, String)))", async () => {
      const r = await framed(
        "map('a', 42::Variant(UInt8, String))::Map(String, Variant(UInt8, String))::Dynamic",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toEqual(new Map([["a", 42]]));
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Dynamic(Array(Dynamic))", async () => {
      const r = await framed(
        "['x'::Dynamic, 'y'::Dynamic]::Array(Dynamic)::Dynamic",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toEqual(["x", "y"]);
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Dynamic(JSON)", async () => {
      const r = await framed(`'{"a":1}'::JSON::Dynamic`);
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toEqual(new Map([["a", 1n]]));
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("Dynamic(Nested)", async () => {
      const r = await framed(
        "[(1, 'x'), (2, 'y')]::Nested(a UInt8, b String)::Dynamic",
      );
      expect(readInt32(r)).toBe(LEAD);
      expect(readDynamic(r)).toEqual([
        { a: 1, b: "x" },
        { a: 2, b: "y" },
      ]);
      expect(readInt32(r)).toBe(TRAIL);
    });
  });

  describe("JSON with several self-describing paths", () => {
    it("mixed value types (Int64, String, Array)", async () => {
      const r = await framed(`'{"i":1,"s":"hi","arr":[1,2]}'::JSON`);
      expect(readInt32(r)).toBe(LEAD);
      expect(readJSON(r)).toEqual(
        new Map<string, unknown>([
          ["arr", [1n, 2n]],
          ["s", "hi"],
          ["i", 1n],
        ]),
      );
      expect(readInt32(r)).toBe(TRAIL);
    });

    it("nested object flattened to dotted paths", async () => {
      const r = await framed(`'{"a":{"b":2},"c":3}'::JSON`);
      expect(readInt32(r)).toBe(LEAD);
      expect(readJSON(r)).toEqual(
        new Map<string, unknown>([
          ["a.b", 2n],
          ["c", 3n],
        ]),
      );
      expect(readInt32(r)).toBe(TRAIL);
    });
  });
});
