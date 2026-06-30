import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { encode } from "./encode.js";
import {
  writeDecimal32,
  writeDecimal64,
  writeDecimal128,
  writeDecimal256,
  parseDecimal,
} from "../src/writers/decimals.js";

describe("writeDecimal32", () => {
  it("encodes 1.5", async () =>
    expect(encode(writeDecimal32, parseDecimal("1.5", 4))).toEqual(
      await query("SELECT CAST('1.5', 'Decimal32(4)') FORMAT RowBinary"),
    ));
  it("encodes -12345.6789", async () =>
    expect(encode(writeDecimal32, parseDecimal("-12345.6789", 4))).toEqual(
      await query(
        "SELECT CAST('-12345.6789', 'Decimal32(4)') FORMAT RowBinary",
      ),
    ));
  it("encodes 0", async () =>
    expect(encode(writeDecimal32, parseDecimal("0", 4))).toEqual(
      await query("SELECT CAST('0', 'Decimal32(4)') FORMAT RowBinary"),
    ));
});

describe("writeDecimal64", () => {
  it("encodes 1.50", async () =>
    expect(encode(writeDecimal64, parseDecimal("1.50", 2))).toEqual(
      await query("SELECT CAST('1.50', 'Decimal64(2)') FORMAT RowBinary"),
    ));
  it("encodes -9999999999.99", async () =>
    expect(encode(writeDecimal64, parseDecimal("-9999999999.99", 2))).toEqual(
      await query(
        "SELECT CAST('-9999999999.99', 'Decimal64(2)') FORMAT RowBinary",
      ),
    ));
});

describe("writeDecimal128", () => {
  it("encodes 3.1415926535", async () =>
    expect(encode(writeDecimal128, parseDecimal("3.1415926535", 10))).toEqual(
      await query(
        "SELECT CAST('3.1415926535', 'Decimal128(10)') FORMAT RowBinary",
      ),
    ));
  it("encodes -1.0000000001", async () =>
    expect(encode(writeDecimal128, parseDecimal("-1.0000000001", 10))).toEqual(
      await query(
        "SELECT CAST('-1.0000000001', 'Decimal128(10)') FORMAT RowBinary",
      ),
    ));
});

describe("writeDecimal256", () => {
  it("encodes 2.71828182845904523536", async () =>
    expect(
      encode(writeDecimal256, parseDecimal("2.71828182845904523536", 20)),
    ).toEqual(
      await query(
        "SELECT CAST('2.71828182845904523536', 'Decimal256(20)') FORMAT RowBinary",
      ),
    ));
  it("encodes -0.00000000000000000001", async () =>
    expect(
      encode(writeDecimal256, parseDecimal("-0.00000000000000000001", 20)),
    ).toEqual(
      await query(
        "SELECT CAST('-0.00000000000000000001', 'Decimal256(20)') FORMAT RowBinary",
      ),
    ));
});

describe("parseDecimal", () => {
  it("scales the integer and fraction parts", () =>
    expect(parseDecimal("1.5000", 4)).toEqual([15000n, 4]));
  it("handles a negative value", () =>
    expect(parseDecimal("-12345.6789", 4)).toEqual([-123456789n, 4]));
  it("handles zero", () => expect(parseDecimal("0.00", 2)).toEqual([0n, 2]));
  it("right-pads a short fraction to the scale", () =>
    expect(parseDecimal("1.5", 4)).toEqual([15000n, 4]));
  it("truncates a fraction longer than the scale", () =>
    expect(parseDecimal("1.56789", 2)).toEqual([156n, 2]));
});
