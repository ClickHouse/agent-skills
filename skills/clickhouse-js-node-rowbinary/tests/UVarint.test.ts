import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUVarint } from "../src/readers/varint.js";

/**
 * RowBinary prefixes every String with its length as a LEB128 unsigned varint.
 * So a real, server-encoded varint of value N is just the leading bytes of
 * `SELECT repeat('a', N) FORMAT RowBinary`, followed by N payload bytes.
 *
 * Edge cases worth covering are the byte-width boundaries of LEB128:
 *   0           — empty, single 0x00 byte
 *   127 / 128   — 1-byte max -> first 2-byte value
 *   16383/16384 — 2-byte max -> first 3-byte value
 */
async function repeatReader(n: number): Promise<Cursor> {
  return new Cursor(await query(`SELECT repeat('a', ${n}) FORMAT RowBinary`));
}

describe("readUVarint", () => {
  it("decodes 0 (single 0x00 byte)", async () => {
    const r = await repeatReader(0);
    expect(readUVarint(r)).toBe(0);
    expect(r.pos).toBe(r.buf.length - 0);
  });

  it("decodes 1", async () => {
    const r = await repeatReader(1);
    expect(readUVarint(r)).toBe(1);
    expect(r.pos).toBe(r.buf.length - 1);
  });

  it("decodes 127 (1-byte max)", async () => {
    const r = await repeatReader(127);
    expect(readUVarint(r)).toBe(127);
    expect(r.pos).toBe(r.buf.length - 127);
  });

  it("decodes 128 (first 2-byte value)", async () => {
    const r = await repeatReader(128);
    expect(readUVarint(r)).toBe(128);
    expect(r.pos).toBe(r.buf.length - 128);
  });

  it("decodes 16383 (2-byte max)", async () => {
    const r = await repeatReader(16383);
    expect(readUVarint(r)).toBe(16383);
    expect(r.pos).toBe(r.buf.length - 16383);
  });

  it("decodes 16384 (first 3-byte value)", async () => {
    const r = await repeatReader(16384);
    expect(readUVarint(r)).toBe(16384);
    expect(r.pos).toBe(r.buf.length - 16384);
  });

  // The upper bound of what readUVarint can represent exactly: values past
  // Number.MAX_SAFE_INTEGER (2^53 - 1) would lose precision (it returns a JS
  // number, not a bigint). Such a length is far larger than any string we
  // could SELECT, so the bytes are constructed directly rather than fetched.
  it("decodes Number.MAX_SAFE_INTEGER (2^53 - 1)", () => {
    // 53 bits set: seven full 7-bit groups (0xff) plus a 4-bit top group (0x0f).
    const r = new Cursor(
      Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x0f]),
    );
    expect(readUVarint(r)).toBe(Number.MAX_SAFE_INTEGER);
    expect(r.pos).toBe(8);
  });

  // One past the safe ceiling: 2^53 (MAX_SAFE_INTEGER + 1). The top group's
  // bit 4 (0x10) sets bit 53; everything below is zero. Must throw rather than
  // return an imprecise number.
  it("throws when a varint exceeds Number.MAX_SAFE_INTEGER", () => {
    const r = new Cursor(
      Buffer.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x10]),
    );
    expect(() => readUVarint(r)).toThrow(RangeError);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix of a multi-byte varint", () => {
      // 16384 -> 3-byte LEB128 [0x80, 0x80, 0x01]; each shorter prefix ends on a
      // byte with the continuation bit set and no following byte, so it must starve.
      const full = Buffer.from([0x80, 0x80, 0x01]);
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readUVarint(r);
        } catch (e) {
          thrown = e;
        }
        expect(thrown, `prefix length ${len}`).toBe(NeedMoreData);
      }
    });
  });
});
