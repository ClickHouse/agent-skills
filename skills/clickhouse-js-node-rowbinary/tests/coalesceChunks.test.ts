import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import { readUInt64 } from "../src/readers/integers.js";
import { coalesceChunks, streamRowBatches } from "../src/readers/stream.js";
import { readString } from "../src/readers/strings.js";

/**
 * `coalesceChunks` merges a too-small chunk stream into chunks of at least
 * `minSize` bytes (flushing early on `timeoutMs` or end-of-stream). It is a pure
 * byte-level filter — no ClickHouse needed for most of it — composed in front of
 * `streamRowBatches`. These tests pin both the size-based and timeout-based
 * flush paths and prove the bytes survive the round-trip unchanged.
 */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A buffer holding the sequential bytes `[from, to)` (mod 256). */
const seq = (from: number, to: number): Buffer =>
  Buffer.from(Array.from({ length: to - from }, (_, i) => (from + i) & 0xff));

async function collect(src: AsyncIterable<Buffer>): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for await (const c of src) out.push(c);
  return out;
}

describe("coalesceChunks (debounce small chunks before streaming)", () => {
  it("accumulates tiny chunks up to minSize, preserving byte order", async () => {
    async function* tiny(): AsyncGenerator<Buffer> {
      for (let i = 0; i < 20; i++) yield seq(i, i + 1); // 20 × 1 byte
    }
    // Long timeout: chunks arrive back-to-back, so only the size rule fires.
    const out = await collect(
      coalesceChunks(tiny(), { minSize: 5, timeoutMs: 10_000 }),
    );
    expect(out.map((c) => c.length)).toEqual([5, 5, 5, 5]);
    expect(Buffer.concat(out)).toEqual(seq(0, 20));
  });

  it("passes a single already-large chunk straight through without copying", async () => {
    const big = seq(0, 100);
    async function* one(): AsyncGenerator<Buffer> {
      yield big;
    }
    const out = await collect(
      coalesceChunks(one(), { minSize: 16, timeoutMs: 10_000 }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(big); // same reference: no concat when one part suffices
  });

  it("flushes the remainder below minSize at end of stream", async () => {
    async function* short(): AsyncGenerator<Buffer> {
      yield seq(0, 3);
      yield seq(3, 7); // 7 bytes total, never reaches minSize
    }
    const out = await collect(
      coalesceChunks(short(), { minSize: 1000, timeoutMs: 10_000 }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(seq(0, 7));
  });

  it("flushes early on the timeout when data arrives in a trickle", async () => {
    async function* trickle(): AsyncGenerator<Buffer> {
      yield seq(0, 10); // below minSize
      await delay(80); // > timeoutMs, so the buffered 10 bytes flush first
      yield seq(10, 20);
    }
    const out = await collect(
      coalesceChunks(trickle(), { minSize: 1000, timeoutMs: 20 }),
    );
    // First 10 bytes flushed by the timer, last 10 by end-of-stream.
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(seq(0, 10));
    expect(out[1]).toEqual(seq(10, 20));
  });

  it("anchors the deadline at first byte — a steady trickle can't defer forever", async () => {
    async function* drip(): AsyncGenerator<Buffer> {
      // Five 1-byte chunks, each ~15ms apart; deadline is 25ms from the FIRST.
      for (let i = 0; i < 5; i++) {
        yield seq(i, i + 1);
        await delay(15);
      }
    }
    const out = await collect(
      coalesceChunks(drip(), { minSize: 1000, timeoutMs: 25 }),
    );
    // The flush must land mid-trickle (not swallow all five into one), proving
    // the deadline is anchored and not reset by each arriving chunk.
    expect(out.length).toBeGreaterThan(1);
    expect(Buffer.concat(out)).toEqual(seq(0, 5));
  });

  it("releases the source when the consumer breaks out early", async () => {
    let returned = false;
    async function* infinite(): AsyncGenerator<Buffer> {
      try {
        for (let i = 0; ; i++) yield seq(i, i + 1);
      } finally {
        returned = true; // source cleanup ran
      }
    }
    // minSize 1 → the first chunk flushes immediately; then we bail.
    for await (const _ of coalesceChunks(infinite(), {
      minSize: 1,
      timeoutMs: 10_000,
    })) {
      break;
    }
    expect(returned).toBe(true);
  });

  it("composes in front of streamRowBatches: 1-byte chunks decode correctly", async () => {
    type Row = { id: bigint; s: string };
    const readRow = (s: Cursor): Row => ({
      id: readUInt64(s),
      s: readString(s),
    });
    const full = await query(
      "SELECT number AS id, repeat('q', number % 7) AS s FROM numbers(40) FORMAT RowBinary",
    );
    const expected: Row[] = Array.from({ length: 40 }, (_, i) => ({
      id: BigInt(i),
      s: "q".repeat(i % 7),
    }));

    async function* oneByteAtATime(): AsyncGenerator<Buffer> {
      for (let i = 0; i < full.length; i++) yield full.subarray(i, i + 1);
    }

    const rows: Row[] = [];
    for await (const batch of streamRowBatches(
      coalesceChunks(oneByteAtATime(), { minSize: 32, timeoutMs: 10_000 }),
      readRow,
    )) {
      rows.push(...batch);
    }
    expect(rows).toEqual(expected);
  });
});
