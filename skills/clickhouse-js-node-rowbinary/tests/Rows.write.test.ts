import { describe, expect, it, vi } from "vitest";
import diagnostics_channel from "node:diagnostics_channel";
import { query } from "./clickhouse.js";
import {
  writeRows,
  FLUSH_CHANNEL_NAME,
  type WriteRowsFlush,
} from "../src/writers/rows.js";
import { type Writer } from "../src/writers/core.js";
import { writeTupleNamed } from "../src/writers/composite.js";
import { writeUInt64, writeUInt32 } from "../src/writers/integers.js";
import { writeString } from "../src/writers/strings.js";

type Row = {
  id: bigint;
  n: number;
  name: string;
};

const writeRow = writeTupleNamed<Row>({
  id: writeUInt64,
  n: writeUInt32,
  name: writeString,
});

/**
 * Drive `writeRows` to completion and concatenate every yielded buffer — the
 * canonical driver loop. `bufferSize` sizes each (fixed) sink, so a small value
 * forces the overflow + flush path; the default fits the rows in one buffer.
 */
function encodeRows(
  write: Writer<Row>,
  rows: Iterable<Row>,
  bufferSize = 4096,
): Buffer {
  return Buffer.concat([...writeRows(write)(rows, bufferSize)]);
}

describe("writeRows", () => {
  const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({
    id: BigInt(i),
    n: i * 10,
    name: `row${i}`,
  }));
  const sql =
    "SELECT toUInt64(number) AS id, toUInt32(number * 10) AS n, concat('row', toString(number)) AS name " +
    "FROM numbers(5) FORMAT RowBinary";

  it("encodes a plain RowBinary result of several rows", async () => {
    expect(encodeRows(writeRow, rows)).toEqual(await query(sql));
  });

  it("writes nothing for an empty array", () =>
    expect(encodeRows(writeRow, []).length).toBe(0));

  it("flushes on buffer overflow and resumes — same bytes across a tiny buffer", async () => {
    // A buffer far smaller than the whole result: the driver must flush full
    // buffers mid-stream at row boundaries and reassemble to the identical bytes.
    const expected = await query(sql);
    const tiny = encodeRows(writeRow, rows, 20); // 20 holds one 17-byte row, not two
    expect(tiny).toEqual(expected);
  });

  it("yields at row boundaries, never a half-written row", () => {
    // bufferSize holds two rows + change but not three, so the first yield must
    // land exactly on a row boundary (a whole number of rows), not mid-row.
    const gen = writeRows(writeRow)(rows, 40);
    const first = gen.next();
    expect(first.done).toBe(false);
    const flushed = first.value as Buffer;
    // A prefix check alone is NOT enough — a mid-row split is also a prefix. Prove
    // the flush ends EXACTLY on a row boundary: collect the per-row cumulative byte
    // offsets and assert the flushed length is one of them (i.e. a whole number of
    // rows), AND that the bytes are the matching prefix of the full encoding.
    const boundaries = new Set<number>();
    let acc = 0;
    for (const row of rows) {
      acc += encodeRows(writeRow, [row]).length;
      boundaries.add(acc);
    }
    expect(boundaries.has(flushed.length)).toBe(true); // ends on a row boundary
    const full = encodeRows(writeRow, rows);
    expect(full.subarray(0, flushed.length)).toEqual(flushed); // and is that prefix
  });

  it("yields independent buffers — a flushed buffer survives the next iteration", () => {
    // Each flush gets a fresh buffer, so an earlier yield isn't clobbered when
    // the generator resumes. Collect two buffers, then assert the first is intact.
    const gen = writeRows(writeRow)(rows, 20);
    const a = gen.next().value as Buffer;
    const snapshot = Buffer.from(a); // independent copy of what we saw first
    gen.next(); // resume: writes the next row into a NEW buffer
    expect(a).toEqual(snapshot); // `a` must be untouched
  });

  it("grows the buffer to fit a row larger than bufferSize, warning once", async () => {
    const expected = await query(sql);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // bufferSize 4 can't hold even one 17-byte row: the buffer doubles
      // (4→8→16→32) until the row fits — no data lost, nothing thrown — and it
      // warns exactly once even though it grew several times.
      expect(encodeRows(writeRow, rows, 4)).toEqual(expected);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toMatch(/didn't fit bufferSize=4/);
    } finally {
      warn.mockRestore();
    }
  });

  it("does not warn when every row fits the buffer", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      encodeRows(writeRow, rows); // default 4096 fits every row
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("rejects a non-positive or non-integer bufferSize instead of looping forever", () => {
    // 0 / NaN would make the growth loop spin (size *= 2 never escapes 0/NaN);
    // fail fast on first .next() with a clear error.
    for (const bad of [0, -1, NaN, 1.5, Infinity]) {
      const gen = writeRows(writeRow)(rows, bad);
      expect(() => gen.next()).toThrow(/bufferSize must be a positive integer/);
    }
  });

  /** Run `body` with a subscriber on the flush channel, collecting every event. */
  function withFlushEvents(body: () => void): WriteRowsFlush[] {
    const events: WriteRowsFlush[] = [];
    const onMessage = (msg: unknown) => events.push(msg as WriteRowsFlush);
    diagnostics_channel.subscribe(FLUSH_CHANNEL_NAME, onMessage);
    try {
      body();
    } finally {
      diagnostics_channel.unsubscribe(FLUSH_CHANNEL_NAME, onMessage);
    }
    return events;
  }

  it("publishes a flush event per buffer — every 'full' batch fills its capacity, then one 'end'", () => {
    // bufferSize 20 holds one 17-byte row: rows 0..3 each flush a 'full' buffer
    // when the next row overflows, row 4 comes out as the 'end' batch.
    const events = withFlushEvents(() => encodeRows(writeRow, rows, 20));
    expect(events.map((e) => e.reason)).toEqual([
      "full",
      "full",
      "full",
      "full",
      "end",
    ]);
    // Every buffer reports its real capacity and the configured size; used never
    // exceeds capacity; nothing grew, so capacity stays at bufferSize.
    for (const e of events) {
      expect(e.capacityBytes).toBe(20);
      expect(e.bufferSize).toBe(20);
      expect(e.usedBytes).toBeLessThanOrEqual(e.capacityBytes);
    }
    // The four mid-stream flushes each carried exactly one 17-byte row.
    expect(events.slice(0, 4).every((e) => e.usedBytes === 17)).toBe(true);
    // Summed used bytes equal the whole payload — nothing is double-counted.
    const total = events.reduce((n, e) => n + e.usedBytes, 0);
    expect(total).toBe(encodeRows(writeRow, rows).length);
  });

  it("reports the grown capacity and original bufferSize so overflow is identifiable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // bufferSize 4 grows to 32 to fit a 17-byte row; the published capacity is
      // the grown size while bufferSize stays 4, so `capacityBytes > bufferSize`
      // flags the overflow and `usedBytes / bufferSize` gives its magnitude.
      const events = withFlushEvents(() => encodeRows(writeRow, rows, 4));
      expect(events.every((e) => e.capacityBytes === 32)).toBe(true);
      expect(events.every((e) => e.bufferSize === 4)).toBe(true);
      expect(events.every((e) => e.capacityBytes > e.bufferSize)).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("stops publishing to a subscriber once it unsubscribes", () => {
    const events: WriteRowsFlush[] = [];
    const onMessage = (msg: unknown) => events.push(msg as WriteRowsFlush);
    diagnostics_channel.subscribe(FLUSH_CHANNEL_NAME, onMessage);
    encodeRows(writeRow, rows, 20);
    const afterFirst = events.length;
    expect(afterFirst).toBeGreaterThan(0);
    diagnostics_channel.unsubscribe(FLUSH_CHANNEL_NAME, onMessage);
    encodeRows(writeRow, rows, 20); // a second run with no subscriber
    expect(events.length).toBe(afterFirst); // nothing more delivered
  });
});
