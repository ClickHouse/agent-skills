import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { encode } from "./encode.js";
import { Sink } from "../src/writers/core.js";
import {
  writeIPv4,
  writeIPv6,
  parseIPv4,
  parseIPv6,
} from "../src/writers/ip.js";

describe("writeIPv4", () => {
  it("encodes 0.0.0.0", async () =>
    expect(encode(writeIPv4, parseIPv4("0.0.0.0"))).toEqual(
      await query("SELECT toIPv4('0.0.0.0') FORMAT RowBinary"),
    ));
  it("encodes 1.2.3.4", async () =>
    expect(encode(writeIPv4, parseIPv4("1.2.3.4"))).toEqual(
      await query("SELECT toIPv4('1.2.3.4') FORMAT RowBinary"),
    ));
  it("encodes 192.168.0.1", async () =>
    expect(encode(writeIPv4, parseIPv4("192.168.0.1"))).toEqual(
      await query("SELECT toIPv4('192.168.0.1') FORMAT RowBinary"),
    ));
  it("encodes 255.255.255.255", async () =>
    expect(encode(writeIPv4, parseIPv4("255.255.255.255"))).toEqual(
      await query("SELECT toIPv4('255.255.255.255') FORMAT RowBinary"),
    ));
});

describe("parseIPv4", () => {
  it("packs the dotted quad big-endian", () =>
    expect(parseIPv4("1.2.3.4")).toBe(0x01020304));
  it("rejects an out-of-range octet", () =>
    expect(() => parseIPv4("1.2.3.256")).toThrow(RangeError));
});

describe("writeIPv6", () => {
  it("encodes ::", async () =>
    expect(encode(writeIPv6, parseIPv6("::"))).toEqual(
      await query("SELECT toIPv6('::') FORMAT RowBinary"),
    ));
  it("encodes ::1", async () =>
    expect(encode(writeIPv6, parseIPv6("::1"))).toEqual(
      await query("SELECT toIPv6('::1') FORMAT RowBinary"),
    ));
  it("encodes 2001:db8::1", async () =>
    expect(encode(writeIPv6, parseIPv6("2001:db8::1"))).toEqual(
      await query("SELECT toIPv6('2001:db8::1') FORMAT RowBinary"),
    ));
  it("encodes fe80::a6:6ad3:dba0:1", async () =>
    expect(encode(writeIPv6, parseIPv6("fe80::a6:6ad3:dba0:1"))).toEqual(
      await query("SELECT toIPv6('fe80::a6:6ad3:dba0:1') FORMAT RowBinary"),
    ));
  it("encodes the IPv4-mapped ::ffff:1.2.3.4", async () =>
    expect(encode(writeIPv6, parseIPv6("::ffff:1.2.3.4"))).toEqual(
      await query("SELECT toIPv6('::ffff:1.2.3.4') FORMAT RowBinary"),
    ));

  it("rejects non-16-byte input", () =>
    expect(() =>
      writeIPv6(new Sink(Buffer.allocUnsafe(16)), Buffer.alloc(4)),
    ).toThrow(RangeError));
});

describe("parseIPv6 validation", () => {
  it("rejects a non-hex group instead of silently encoding 0", () =>
    expect(() => parseIPv6("2001:db8::gggg")).toThrow(RangeError));
  it("rejects a negative group instead of wrapping to 0xffff", () =>
    expect(() => parseIPv6("2001:db8::-1")).toThrow(RangeError));
  it("rejects an over-long (5-digit) group", () =>
    expect(() => parseIPv6("2001:db8::12345")).toThrow(RangeError));
  it("rejects an empty group", () =>
    expect(() => parseIPv6("2001:db8:::1")).toThrow(RangeError));
});
