import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import { readInt32, readUInt64 } from "../src/readers/integers.js";
import { readRows } from "../src/readers/rows.js";
import { readString } from "../src/readers/strings.js";

/**
 * Multi-row tests: plain `RowBinary` concatenates rows back-to-back with no row
 * count, length prefix, or delimiter between them — a row is just its columns,
 * and the next row's bytes begin immediately after the previous row's last
 * column. So decoding N rows is the same per-row read run N times against one
 * shared buffer/cursor.
 *
 * Each test asserts two things: (a) every row decodes to the expected values,
 * and (b) the cursor lands EXACTLY on `buf.length` after the final row. The
 * end-position check is the tight one — if any row's reader stopped one byte
 * short or long, the misalignment compounds across rows and the cursor misses
 * the end, so a wrong row boundary can't slip through unnoticed.
 *
 * Variable-width columns (String) are the sharp case: there is no fixed row
 * stride to resync on, so the only thing keeping rows aligned is each reader
 * consuming exactly its bytes.
 */
describe("multiple rows from one buffer", () => {
  it("fixed-width single column: read a known row count in a loop", async () => {
    const r = new Cursor(
      await query("SELECT toInt32(number) FROM numbers(5) FORMAT RowBinary"),
    );
    const out: number[] = [];
    for (let i = 0; i < 5; i++) out.push(readInt32(r));
    expect(out).toEqual([0, 1, 2, 3, 4]);
    expect(r.pos).toBe(r.buf.length);
  });

  it("two fixed-width columns per row", async () => {
    const r = new Cursor(
      await query(
        "SELECT toUInt64(number), toInt32(-number) FROM numbers(4) FORMAT RowBinary",
      ),
    );
    const out: Array<[bigint, number]> = [];
    for (let i = 0; i < 4; i++) out.push([readUInt64(r), readInt32(r)]);
    expect(out).toEqual([
      [0n, 0],
      [1n, -1],
      [2n, -2],
      [3n, -3],
    ]);
    expect(r.pos).toBe(r.buf.length);
  });

  it("variable-width column: rows of differing String length stay aligned", async () => {
    // repeat('x', number) yields strings of length 0,1,2,3,4 — every row has a
    // different byte width, so alignment depends entirely on readString
    // consuming exactly its varint length + bytes.
    const r = new Cursor(
      await query(
        "SELECT repeat('x', number) FROM numbers(5) FORMAT RowBinary",
      ),
    );
    const out: string[] = [];
    for (let i = 0; i < 5; i++) out.push(readString(r));
    expect(out).toEqual(["", "x", "xx", "xxx", "xxxx"]);
    expect(r.pos).toBe(r.buf.length);
  });

  it("mixed fixed + variable columns per row", async () => {
    const r = new Cursor(
      await query(
        "SELECT number AS n, repeat('ab', number) AS s FROM numbers(3) FORMAT RowBinary",
      ),
    );
    const out: Array<[bigint, string]> = [];
    for (let i = 0; i < 3; i++) out.push([readUInt64(r), readString(r)]);
    expect(out).toEqual([
      [0n, ""],
      [1n, "ab"],
      [2n, "abab"],
    ]);
    expect(r.pos).toBe(r.buf.length);
  });

  it("drives the loop on cursor position, without knowing the row count", async () => {
    // With no row count on the wire, a reader that doesn't know N up front
    // loops until the cursor reaches the buffer end. This works precisely
    // because each row consumes exactly its bytes — the end is a row boundary.
    const r = new Cursor(
      await query("SELECT toInt32(number) FROM numbers(10) FORMAT RowBinary"),
    );
    const out: number[] = [];
    while (r.pos < r.buf.length) out.push(readInt32(r));
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.pos).toBe(r.buf.length);
  });

  it("zero rows: an empty result is an empty buffer", async () => {
    const r = new Cursor(
      await query("SELECT toInt32(1) WHERE 0 FORMAT RowBinary"),
    );
    expect(r.buf.length).toBe(0);
    const out: number[] = [];
    while (r.pos < r.buf.length) out.push(readInt32(r));
    expect(out).toEqual([]);
    expect(r.pos).toBe(r.buf.length);
  });

  describe("readRows() helper: the position-bounded loop as a method", () => {
    it("reads every row via a per-row callback", async () => {
      const r = new Cursor(
        await query(
          "SELECT number AS id, repeat('ab', number) AS name FROM numbers(3) FORMAT RowBinary",
        ),
      );
      const out = readRows((s) => ({
        id: readUInt64(s),
        name: readString(s),
      }))(r);
      expect(out).toEqual([
        { id: 0n, name: "" },
        { id: 1n, name: "ab" },
        { id: 2n, name: "abab" },
      ]);
      expect(r.pos).toBe(r.buf.length);
    });

    it("returns [] for an empty result", async () => {
      const r = new Cursor(
        await query("SELECT toInt32(1) WHERE 0 FORMAT RowBinary"),
      );
      expect(readRows(readInt32)(r)).toEqual([]);
      expect(r.pos).toBe(r.buf.length);
    });
  });

  describe("readRows() with NeedMoreData (partial trailing row)", () => {
    it("returns the complete rows and rewinds pos to the last row boundary", async () => {
      // 4 rows of (UInt64, String) — fixed 8 bytes + a varint-prefixed string.
      const full = await query(
        "SELECT number AS id, repeat('ab', number) AS s FROM numbers(4) FORMAT RowBinary",
      );

      // Find the byte offset where row 2 (0-indexed) ends, by decoding the full
      // buffer once and committing per row.
      const probe = new Cursor(full);
      const ends: number[] = [];
      readRows((s) => {
        readUInt64(s);
        readString(s);
        ends.push(s.pos);
        return null;
      })(probe);
      // Cut the buffer one byte before the end so the LAST row is truncated.
      const r = new Cursor(full.subarray(0, full.length - 1));
      const rows = readRows((s) => ({
        id: readUInt64(s),
        s: readString(s),
      }))(r);
      // Only the 3 complete rows come back; the 4th (straddling) is dropped.
      expect(rows).toEqual([
        { id: 0n, s: "" },
        { id: 1n, s: "ab" },
        { id: 2n, s: "abab" },
      ]);
      // pos is rewound to the start of the incomplete 4th row, NOT left mid-row.
      expect(r.pos).toBe(ends[2]);
      expect(r.pos).toBeLessThan(r.buf.length);
    });

    it("drives a chunked stream to completion via the commit point", async () => {
      const full = await query(
        "SELECT number AS id, repeat('x', number % 7) AS s FROM numbers(50) FORMAT RowBinary",
      );
      const expected = Array.from({ length: 50 }, (_, i) => ({
        id: BigInt(i),
        s: "x".repeat(i % 7),
      }));

      // Reveal the buffer in fixed chunks; each step decodes whatever complete
      // rows are now visible and carries the commit point forward. Tiny chunk
      // sizes guarantee rows straddle boundaries.
      for (const chunk of [1, 5, 13, 4096]) {
        const rows: Array<{ id: bigint; s: string }> = [];
        let committed = 0;
        let avail = 0;
        while (committed < full.length) {
          avail = Math.min(full.length, avail + chunk);
          const r = new Cursor(full.subarray(0, avail));
          r.pos = committed;
          rows.push(
            ...readRows((s) => ({ id: readUInt64(s), s: readString(s) }))(r),
          );
          // Guard against a stall: a non-final chunk that completed no new row
          // just means we need more bytes — the loop reveals more next pass.
          committed = r.pos;
        }
        expect(rows, `chunk size ${chunk}`).toEqual(expected);
      }
    });

    it("still propagates a non-NeedMoreData error from the row reader", async () => {
      const r = new Cursor(
        await query("SELECT toInt32(1) FROM numbers(3) FORMAT RowBinary"),
      );
      const boom = new Error("decode fault");
      expect(() =>
        readRows(() => {
          throw boom;
        })(r),
      ).toThrow(boom);
    });
  });
});
