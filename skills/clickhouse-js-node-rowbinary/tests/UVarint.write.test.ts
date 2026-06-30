import { describe, expect, it } from "vitest";
import { Sink, reserve, BufferFull } from "../src/writers/core.js";
import { encode } from "./encode.js";
import { writeUVarint } from "../src/writers/varint.js";

/** A fresh sink over a fixed buffer of `capacity` bytes. */
function sink(capacity: number): Sink {
  return new Sink(Buffer.allocUnsafe(capacity));
}

describe("Sink / reserve", () => {
  it("advances and returns the start offset", () => {
    const s = sink(8);
    expect(reserve(s, 4)).toBe(0);
    expect(reserve(s, 2)).toBe(4);
    expect(s.pos).toBe(6);
  });

  it("throws BufferFull without advancing when the buffer is full", () => {
    const s = sink(4);
    expect(reserve(s, 4)).toBe(0);
    let thrown: unknown;
    try {
      reserve(s, 1);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBe(BufferFull);
    expect(s.pos).toBe(4); // position is unchanged on overflow
  });

  it("bytes() returns only the written prefix", () => {
    const s = sink(64);
    s.buf[reserve(s, 1)] = 0x01;
    expect(s.bytes().length).toBe(1);
  });
});

describe("writeUVarint", () => {
  // Hard-coded LEB128 expectations — independent of the reader.
  it("encodes 0 as a single 0x00 byte", () =>
    expect([...encode(writeUVarint, 0)]).toEqual([0x00]));
  it("encodes 1", () => expect([...encode(writeUVarint, 1)]).toEqual([0x01]));
  it("encodes 127 in one byte", () =>
    expect([...encode(writeUVarint, 127)]).toEqual([0x7f]));
  it("encodes 128 in two bytes", () =>
    expect([...encode(writeUVarint, 128)]).toEqual([0x80, 0x01]));
  it("encodes 300 as [0xac, 0x02]", () =>
    expect([...encode(writeUVarint, 300)]).toEqual([0xac, 0x02]));
  it("encodes 16383 (2-byte boundary)", () =>
    expect([...encode(writeUVarint, 16383)]).toEqual([0xff, 0x7f]));
  it("encodes 16384 (3-byte boundary)", () =>
    expect([...encode(writeUVarint, 16384)]).toEqual([0x80, 0x80, 0x01]));
  it("encodes Number.MAX_SAFE_INTEGER (2^53 - 1)", () =>
    expect([...encode(writeUVarint, Number.MAX_SAFE_INTEGER)]).toEqual([
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x0f,
    ]));
});
