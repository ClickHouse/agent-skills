import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import { readUInt64 } from "../src/readers/integers.js";
import {
  type SmallChunkStats,
  streamRowBatches,
} from "../src/readers/stream.js";
import { readString } from "../src/readers/strings.js";

/**
 * `streamRowBatches` is the async front door over `readRows`: an async iterable
 * of byte chunks in, an async generator of row batches out. A real HTTP response
 * arrives as such a chunk stream; here we take the full `FORMAT RowBinary` bytes
 * ClickHouse returns and re-slice them into fixed-size chunks, which is exactly
 * what the function consumes — and lets us drive every chunk-boundary case
 * (mid-field, mid-row, aligned) deterministically.
 */
async function* chunked(buf: Buffer, size: number): AsyncGenerator<Buffer> {
  for (let i = 0; i < buf.length; i += size) {
    yield buf.subarray(i, Math.min(i + size, buf.length));
  }
}

type Row = { id: bigint; s: string };
const readRow = (s: Cursor): Row => ({
  id: readUInt64(s),
  s: readString(s),
});

describe("streamRowBatches (async, chunked stream -> row batches)", () => {
  it("reassembles every row across chunk sizes, with no empty batches", async () => {
    const full = await query(
      "SELECT number AS id, repeat('x', number % 9) AS s FROM numbers(60) FORMAT RowBinary",
    );
    const expected: Row[] = Array.from({ length: 60 }, (_, i) => ({
      id: BigInt(i),
      s: "x".repeat(i % 9),
    }));

    // Tiny sizes force rows to straddle boundaries; the large one delivers
    // everything in a single batch.
    for (const size of [1, 3, 13, 64, full.length, full.length * 2]) {
      const batches: Row[][] = [];
      for await (const batch of streamRowBatches(
        chunked(full, size),
        readRow,
      )) {
        batches.push(batch);
      }
      expect(
        batches.every((b) => b.length > 0),
        `chunk size ${size}: no empty batches`,
      ).toBe(true);
      expect(batches.flat(), `chunk size ${size}`).toEqual(expected);
    }
  });

  it("delivers everything in one batch when the whole buffer is one chunk", async () => {
    const full = await query(
      "SELECT number AS id, repeat('y', number) AS s FROM numbers(5) FORMAT RowBinary",
    );
    const batches: Row[][] = [];
    for await (const batch of streamRowBatches(
      chunked(full, full.length),
      readRow,
    )) {
      batches.push(batch);
    }
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(5);
  });

  it("yields nothing for an empty result", async () => {
    const full = await query("SELECT toInt32(1) WHERE 0 FORMAT RowBinary");
    expect(full.length).toBe(0);
    const batches: Row[][] = [];
    for await (const batch of streamRowBatches(chunked(full, 8), readRow)) {
      batches.push(batch);
    }
    expect(batches).toEqual([]);
  });

  it("throws when the stream ends mid-row (truncated response)", async () => {
    const full = await query(
      "SELECT number AS id, repeat('z', number + 1) AS s FROM numbers(4) FORMAT RowBinary",
    );
    const truncated = full.subarray(0, full.length - 1); // cut the last row short
    const consume = async () => {
      const out: Row[] = [];
      for await (const batch of streamRowBatches(
        chunked(truncated, 5),
        readRow,
      )) {
        out.push(...batch);
      }
      return out;
    };
    await expect(consume()).rejects.toThrow(/ended mid-row/);
  });

  it("warns once when chunks are pathologically small (rows straddle them)", async () => {
    const full = await query(
      "SELECT number AS id, repeat('w', number % 5) AS s FROM numbers(80) FORMAT RowBinary",
    );
    const warnings: SmallChunkStats[] = [];
    const out: Row[] = [];
    // 1-byte chunks: every row spans many chunks, so rows/chunk is far below 1.
    for await (const batch of streamRowBatches(chunked(full, 1), readRow, {
      warnOnSmallChunks: { warn: (_msg, stats) => warnings.push(stats) },
    })) {
      out.push(...batch);
    }
    expect(out).toHaveLength(80); // still decodes correctly
    expect(warnings).toHaveLength(1); // fires exactly once, not per chunk
    expect(warnings[0]!.rowsPerChunk).toBeLessThan(2);
    expect(warnings[0]!.chunks).toBeGreaterThanOrEqual(16); // past the default warmup
  });

  it("does not warn on a healthy stream (many rows per chunk)", async () => {
    const full = await query(
      "SELECT number AS id, '' AS s FROM numbers(2000) FORMAT RowBinary",
    );
    let warned = false;
    // ~50-byte rows in 4 KB chunks → ~450 rows/chunk, well above the threshold,
    // and a low warmup so the average is actually evaluated.
    for await (const batch of streamRowBatches(chunked(full, 4096), readRow, {
      warnOnSmallChunks: { warmupChunks: 2, warn: () => (warned = true) },
    })) {
      void batch;
    }
    expect(warned).toBe(false);
  });

  it("respects warnOnSmallChunks: false (disabled)", async () => {
    const full = await query(
      "SELECT number AS id, '' AS s FROM numbers(80) FORMAT RowBinary",
    );
    let warned = false;
    const orig = console.warn;
    console.warn = () => (warned = true); // would catch the default sink too
    try {
      for await (const batch of streamRowBatches(chunked(full, 1), readRow, {
        warnOnSmallChunks: false,
      })) {
        void batch;
      }
    } finally {
      console.warn = orig;
    }
    expect(warned).toBe(false);
  });

  it("accepts plain Uint8Array chunks (not just Buffer)", async () => {
    const full = await query(
      "SELECT number AS id, '' AS s FROM numbers(3) FORMAT RowBinary",
    );
    async function* asU8(): AsyncGenerator<Uint8Array> {
      // Hand back a non-Buffer view to exercise the normalization path.
      yield new Uint8Array(full.buffer, full.byteOffset, full.byteLength);
    }
    const batches: Row[][] = [];
    for await (const batch of streamRowBatches(asU8(), readRow)) {
      batches.push(batch);
    }
    expect(batches.flat()).toEqual([
      { id: 0n, s: "" },
      { id: 1n, s: "" },
      { id: 2n, s: "" },
    ]);
  });
});
