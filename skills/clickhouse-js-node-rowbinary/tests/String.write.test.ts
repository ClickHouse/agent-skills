import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { encode } from "./encode.js";
import {
  writeString,
  writeStringBytes,
  writeFixedString,
  writeFixedStringBytes,
} from "../src/writers/strings.js";

describe("writeString", () => {
  it("encodes the empty string", async () =>
    expect(encode(writeString, "")).toEqual(
      await query("SELECT '' FORMAT RowBinary"),
    ));
  it("encodes an ASCII string", async () =>
    expect(encode(writeString, "hello")).toEqual(
      await query("SELECT 'hello' FORMAT RowBinary"),
    ));
  it("encodes a multi-byte UTF-8 string", async () =>
    expect(encode(writeString, "héllo · 日本")).toEqual(
      await query("SELECT 'héllo · 日本' FORMAT RowBinary"),
    ));
  it("encodes a string longer than a 1-byte varint length", async () =>
    expect(encode(writeString, "x".repeat(300))).toEqual(
      await query("SELECT repeat('x', 300) FORMAT RowBinary"),
    ));
});

describe("writeStringBytes", () => {
  it("writes raw (non-UTF-8) bytes from a Uint8Array", () => {
    // varint length 3, then the raw bytes verbatim.
    expect([
      ...encode(writeStringBytes, Buffer.from([0xff, 0x00, 0xfe])),
    ]).toEqual([0x03, 0xff, 0x00, 0xfe]);
  });
});

describe("writeFixedString", () => {
  it("pads to the column width with trailing NULs", async () =>
    expect(encode(writeFixedString(16), "abc")).toEqual(
      await query("SELECT toFixedString('abc', 16) FORMAT RowBinary"),
    ));

  it("throws when the value exceeds the size", () =>
    expect(() => encode(writeFixedString(2), "abc")).toThrow(RangeError));
});

describe("writeFixedStringBytes", () => {
  it("pads raw bytes to the column width with trailing NULs", async () =>
    expect(encode(writeFixedStringBytes(8), Buffer.from("abc"))).toEqual(
      await query("SELECT toFixedString('abc', 8) FORMAT RowBinary"),
    ));

  it("zero-pads a short value", () =>
    expect([...encode(writeFixedStringBytes(4), Buffer.from([1, 2]))]).toEqual([
      1, 2, 0, 0,
    ]));

  it("throws when the value exceeds the size", () =>
    expect(() =>
      encode(writeFixedStringBytes(2), Buffer.from([1, 2, 3])),
    ).toThrow(RangeError));
});
