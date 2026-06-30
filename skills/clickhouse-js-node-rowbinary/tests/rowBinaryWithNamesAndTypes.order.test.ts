import { describe, expect, it } from "vitest";
import { Cursor } from "../src/readers/core.js";
import { compileRowBinaryWithNamesAndTypes } from "../src/readers/rowBinaryWithNamesAndTypes.js";

// Offline regression tests (no server) for the wire-order guarantee of the
// row reader: every row must read EXACTLY one reader per header column, in
// header order, regardless of the column NAMES. These pin the two legal
// headers that a name-keyed reader (Record<name, reader> + Object.keys) would
// mis-decode: duplicate names and integer-like names.

/** LEB128-encode a non-negative integer. */
function uvarint(n: number): number[] {
  const out: number[] = [];
  do {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}

/** Encode a RowBinary `String` (LEB128 length + UTF-8 bytes). */
function str(s: string): number[] {
  const bytes = [...Buffer.from(s, "utf8")];
  return [...uvarint(bytes.length), ...bytes];
}

/**
 * Build a full `RowBinaryWithNamesAndTypes` buffer by hand: the header (column
 * count, names, type strings) followed by the raw row bytes.
 */
function stream(names: string[], types: string[], rowBytes: number[]): Cursor {
  const header = [...uvarint(names.length)];
  for (const n of names) header.push(...str(n));
  for (const t of types) header.push(...str(t));
  return new Cursor(Buffer.from([...header, ...rowBytes]));
}

describe("compileRowBinaryWithNamesAndTypes wire order", () => {
  it("reads one reader per column even when column names collide", () => {
    // Two UInt8 columns both named "x" (legal: `SELECT 1 AS x, 2 AS x`). A
    // name-keyed reader would collapse to a single "x" reader and decode the
    // 4 row bytes as FOUR one-column rows; reading by index gives two rows of
    // two columns, last-name-wins in each object.
    const s = stream(["x", "x"], ["UInt8", "UInt8"], [1, 2, 3, 4]);
    const compiled = compileRowBinaryWithNamesAndTypes(s);
    const rows = compiled.readRows(s);

    expect(rows).toEqual([{ x: 2 }, { x: 4 }]);
    expect(s.pos).toBe(s.buf.length); // consumed exactly — no desync
  });

  it("reads columns in header order even when names are integer-like", () => {
    // Columns named "1" (UInt8) then "0" (UInt16). `Object.keys()` would yield
    // ["0", "1"] (numeric keys sort ascending), flipping the read order and
    // mis-framing the bytes. Reading by index keeps header order.
    // Row bytes: UInt8 = 0xAA (170), then UInt16 LE = 0x0102 (258).
    const s = stream(["1", "0"], ["UInt8", "UInt16"], [0xaa, 0x02, 0x01]);
    const compiled = compileRowBinaryWithNamesAndTypes(s);
    const rows = compiled.readRows(s);

    expect(rows).toEqual([{ "1": 170, "0": 258 }]);
    expect(s.pos).toBe(s.buf.length); // consumed exactly — no mis-framing
  });
});
