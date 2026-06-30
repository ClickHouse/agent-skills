import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt64 } from "../src/readers/integers.js";
import { readString } from "../src/readers/strings.js";

/**
 * `advance` / `NeedMoreData` tests: the per-read "need more bytes" throw that is
 * the foundation for streaming. A read that would cross the end of the buffer
 * throws `NeedMoreData` instead of reading garbage, WITHOUT moving the cursor —
 * so a driver can rewind to its last committed row and retry once more bytes
 * arrive. (This is just the per-read throw; chunk reassembly and commit tracking
 * are the driver's job, modelled here in the tests but not yet in the reader.)
 *
 * The data is real ClickHouse output; the truncation is simulated by viewing a
 * prefix of the response buffer (`buf.subarray(0, avail)`), which is exactly
 * what the reader treats as "all the bytes there are so far".
 */
describe("advance() and NeedMoreData", () => {
  it("throws NeedMoreData when a fixed-width read crosses the end, leaving pos put", async () => {
    const full = await query("SELECT toUInt64(1) FORMAT RowBinary"); // 8 bytes
    const r = new Cursor(full.subarray(0, 5)); // one byte short of nothing
    let thrown: unknown;
    try {
      readUInt64(r);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBe(NeedMoreData);
    expect(r.pos).toBe(0); // cursor not advanced on a starved read
  });

  it("throws NeedMoreData when a String body is truncated past its length prefix", async () => {
    // "hello" -> 1 varint length byte (0x05) + 5 bytes. Reveal length + 2 body
    // bytes: the varint read succeeds, the body read starves.
    const full = await query("SELECT 'hello' FORMAT RowBinary"); // 6 bytes
    const r = new Cursor(full.subarray(0, 3));
    let thrown: unknown;
    try {
      readString(r);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBe(NeedMoreData);
  });

  it("a throw+restart driver reassembles every row from a chunked stream", async () => {
    // (UInt64, String) rows of varying width, so chunk boundaries land mid-field
    // and mid-row, exercising the throw on both the number and the string read.
    const full = await query(
      "SELECT number AS id, repeat('ab', number) AS s FROM numbers(20) FORMAT RowBinary",
    );

    const expected = Array.from({ length: 20 }, (_, i) => ({
      id: BigInt(i),
      s: "ab".repeat(i),
    }));

    // Drive the reader the way a streaming consumer would: reveal `chunk` more
    // bytes whenever a read starves, and restart the row from the last commit.
    for (const chunk of [1, 3, 7, 64, 4096]) {
      const rows: Array<{ id: bigint; s: string }> = [];
      let committed = 0;
      let avail = 0;
      while (committed < full.length) {
        avail = Math.min(full.length, avail + chunk);
        const r = new Cursor(full.subarray(0, avail));
        r.pos = committed;
        try {
          while (r.pos < r.buf.length) {
            const id = readUInt64(r);
            const s = readString(r);
            rows.push({ id, s }); // only reached once BOTH reads succeed
            committed = r.pos; // commit the row boundary
          }
        } catch (e) {
          if (e !== NeedMoreData) throw e;
          // starved: loop, reveal more, retry from `committed` (no double-push,
          // because the row is pushed only after a clean id+s read).
        }
      }
      expect(rows, `chunk size ${chunk}`).toEqual(expected);
    }
  });
});
