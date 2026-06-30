import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { encode } from "./encode.js";
import { Sink } from "../src/writers/core.js";
import {
  writeUUID,
  writeUUIDBigInt,
  writeUUIDHiLo,
  parseUUID,
} from "../src/writers/uuid.js";

const SAMPLE = "61f0c404-5cb3-11e7-907b-a6006ad3dba0";
// ClickHouse stores a UUID as two little-endian UInt64 halves (high then low).
const HI = 0x61f0c4045cb311e7n;
const LO = 0x907ba6006ad3dba0n;
// The same UUID as one 128-bit value (hi in the high 64 bits, lo in the low).
const HI_LO_UUID: bigint = (HI << 64n) | LO;
const WIRE = [
  0xe7,
  0x11,
  0xb3,
  0x5c,
  0x04,
  0xc4,
  0xf0,
  0x61, // high half, little-endian
  0xa0,
  0xdb,
  0xd3,
  0x6a,
  0x00,
  0xa6,
  0x7b,
  0x90, // low half, little-endian
];

describe("UUID writers", () => {
  it("writeUUID copies the raw 16 wire bytes verbatim", async () =>
    expect(encode(writeUUID, Buffer.from(WIRE))).toEqual(
      await query(`SELECT toUUID('${SAMPLE}') FORMAT RowBinary`),
    ));

  it("writeUUIDBigInt splits a 128-bit bigint into the two LE halves", async () =>
    expect(encode(writeUUIDBigInt, HI_LO_UUID)).toEqual(
      await query(`SELECT toUUID('${SAMPLE}') FORMAT RowBinary`),
    ));

  it("writeUUIDHiLo writes the two raw [hi, lo] halves", async () =>
    expect(encode(writeUUIDHiLo, [HI, LO])).toEqual(
      await query(`SELECT toUUID('${SAMPLE}') FORMAT RowBinary`),
    ));

  it("parseUUID turns the canonical string into the wire bytes", () =>
    expect([...parseUUID(SAMPLE)]).toEqual(WIRE));

  it("writeUUID rejects non-16-byte input", () =>
    expect(() =>
      writeUUID(new Sink(Buffer.allocUnsafe(16)), Buffer.alloc(15)),
    ).toThrow(RangeError));
});
