import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { encode } from "./encode.js";
import {
  writeNullable,
  writeArray,
  writeTuple,
  writeTupleNamed,
  writeMap,
  writeVariant,
} from "../src/writers/composite.js";
import { writeInt32, writeUInt32 } from "../src/writers/integers.js";
import { writeString } from "../src/writers/strings.js";

describe("writeNullable", () => {
  it("encodes a present value (flag 0 then the value)", async () =>
    expect(encode(writeNullable(writeUInt32), 42)).toEqual(
      await query("SELECT toNullable(toUInt32(42)) FORMAT RowBinary"),
    ));
  it("encodes NULL as the lone flag byte", async () =>
    expect(encode(writeNullable(writeUInt32), null)).toEqual(
      await query("SELECT CAST(NULL AS Nullable(UInt32)) FORMAT RowBinary"),
    ));
});

describe("writeArray", () => {
  it("encodes Array(UInt32)", async () =>
    expect(encode(writeArray(writeUInt32), [1, 2, 3])).toEqual(
      await query("SELECT [1, 2, 3]::Array(UInt32) FORMAT RowBinary"),
    ));
  it("encodes an empty array as a single 0x00 length", async () =>
    expect(encode(writeArray(writeUInt32), [])).toEqual(
      await query("SELECT []::Array(UInt32) FORMAT RowBinary"),
    ));
});

describe("writeTuple / writeTupleNamed", () => {
  it("encodes a positional Tuple(UInt32, String)", async () =>
    expect(
      encode(writeTuple<[number, string]>([writeUInt32, writeString]), [
        7,
        "hi",
      ]),
    ).toEqual(await query("SELECT (toUInt32(7), 'hi') FORMAT RowBinary")));

  it("encodes a named Tuple in field order", async () =>
    expect(
      encode(
        writeTupleNamed<{ id: number; name: string }>({
          id: writeUInt32,
          name: writeString,
        }),
        { id: 7, name: "hi" },
      ),
    ).toEqual(
      await query(
        "SELECT CAST((toUInt32(7), 'hi'), 'Tuple(id UInt32, name String)') FORMAT RowBinary",
      ),
    ));
});

describe("writeMap", () => {
  it("encodes Map(String, UInt32) in insertion order", async () =>
    expect(
      encode(
        writeMap(writeString, writeUInt32),
        new Map([
          ["a", 1],
          ["b", 2],
        ]),
      ),
    ).toEqual(
      await query(
        "SELECT map('a', toUInt32(1), 'b', toUInt32(2)) FORMAT RowBinary",
      ),
    ));
});

describe("writeVariant", () => {
  // Variant(Int32, String) sorts by type name: ["Int32", "String"].
  const writeV = writeVariant([writeInt32, writeString]);

  it("encodes the Int32 alternative (discriminant 0)", async () =>
    expect(encode(writeV, [0, -5])).toEqual(
      await query(
        "SELECT CAST(toInt32(-5), 'Variant(Int32, String)') SETTINGS allow_experimental_variant_type = 1 FORMAT RowBinary",
      ),
    ));

  it("encodes the String alternative (discriminant 1)", async () =>
    expect(encode(writeV, [1, "hello"])).toEqual(
      await query(
        "SELECT CAST('hello', 'Variant(Int32, String)') SETTINGS allow_experimental_variant_type = 1 FORMAT RowBinary",
      ),
    ));

  it("encodes NULL as a single 0xFF byte", () =>
    expect([...encode(writeV, null)]).toEqual([0xff]));

  it("throws for an out-of-range discriminant", () =>
    expect(() => encode(writeV, [9, 0])).toThrow(RangeError));
});
