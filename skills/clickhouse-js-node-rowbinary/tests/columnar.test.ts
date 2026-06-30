import { afterEach, describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { streamSensorColumns } from "../src/readers/columnar.js";

/**
 * Eval for the streaming columnar decoder (`streamSensorColumns`). The example
 * schema — `sensor_id UInt32, ts DateTime64(3), value Float64, quality Float32,
 * status UInt8` — is a 25-byte fixed-width row, generated here by the live
 * ClickHouse server so we decode against its OWN RowBinary bytes.
 *
 * Three things under test:
 *  1. correctness of every column, checked against a reference decode of the
 *     same buffer;
 *  2. the streaming contract — chunk boundaries that fall mid-row must not
 *     corrupt or drop rows, and a truncated stream must throw;
 *  3. THE COLUMNAR INVARIANT THAT MATTERS HERE: the Int64 (`ts`) column is filled
 *     by copying two 32-bit words, NOT via `getBigInt64`, so no bigint is
 *     allocated per row on the decode path. We prove it by spying on
 *     `DataView.prototype.getBigInt64` and asserting it is never called while
 *     decoding.
 */

const STRIDE = 25;
const N = 1000;

// Deterministic, exactly representable values per column. `ts` is a DateTime64(3),
// whose wire form is Int64 millisecond ticks — here (1700000000 + i) * 1000.
const SELECT =
  `SELECT toUInt32(number) AS sensor_id, ` +
  `toDateTime64(1700000000 + number, 3) AS ts, ` +
  `toFloat64(number) / 2 AS value, ` +
  `toFloat32(number) AS quality, ` +
  `toUInt8(number % 256) AS status ` +
  `FROM numbers(${N})`;

const BUF = await query(`${SELECT} FORMAT RowBinary`);

/** Reference decode of the whole buffer — the test is free to allocate bigints. */
function reference(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const sensor_id: number[] = [];
  const ts: bigint[] = [];
  const value: number[] = [];
  const quality: number[] = [];
  const status: number[] = [];
  for (let o = 0; o + STRIDE <= buf.length; o += STRIDE) {
    sensor_id.push(view.getUint32(o, true));
    ts.push(view.getBigInt64(o + 4, true));
    value.push(view.getFloat64(o + 12, true));
    quality.push(view.getFloat32(o + 20, true));
    status.push(buf[o + 24]!);
  }
  return { sensor_id, ts, value, quality, status };
}

/** Yield `buf` in chunks of the given repeating sizes (deliberately mid-row). */
async function* chunked(
  buf: Buffer,
  sizes: number[],
): AsyncGenerator<Uint8Array> {
  let o = 0;
  let k = 0;
  while (o < buf.length) {
    const len = sizes[k++ % sizes.length]!;
    yield buf.subarray(o, Math.min(o + len, buf.length));
    o += len;
  }
}

/** Drain the columnar stream into flat per-column arrays. */
async function collect(chunks: AsyncIterable<Uint8Array>) {
  const sensor_id: number[] = [];
  const ts: bigint[] = [];
  const value: number[] = [];
  const quality: number[] = [];
  const status: number[] = [];
  let batches = 0;
  for await (const b of streamSensorColumns(chunks)) {
    batches++;
    for (let i = 0; i < b.rows; i++) {
      sensor_id.push(b.columns.sensor_id[i]!);
      ts.push(b.columns.ts[i]!);
      value.push(b.columns.value[i]!);
      quality.push(b.columns.quality[i]!);
      status.push(b.columns.status[i]!);
    }
  }
  return { sensor_id, ts, value, quality, status, batches };
}

describe("streamSensorColumns", () => {
  it("matches a reference decode of the live RowBinary buffer", async () => {
    const ref = reference(BUF);
    // One chunk = whole buffer.
    const got = await collect(chunked(BUF, [BUF.length]));
    expect(got.sensor_id).toEqual(ref.sensor_id);
    expect(got.ts).toEqual(ref.ts);
    expect(got.value).toEqual(ref.value);
    expect(got.quality).toEqual(ref.quality);
    expect(got.status).toEqual(ref.status);
    expect(got.sensor_id.length).toBe(N);
  });

  it("survives chunk boundaries that split rows mid-field", async () => {
    const ref = reference(BUF);
    // Sizes coprime-ish to STRIDE (25) so boundaries land inside every field.
    const got = await collect(chunked(BUF, [1, 7, 13, 100, 3]));
    expect(got.batches).toBeGreaterThan(1);
    expect(got.sensor_id).toEqual(ref.sensor_id);
    expect(got.ts).toEqual(ref.ts);
    expect(got.value).toEqual(ref.value);
    expect(got.quality).toEqual(ref.quality);
    expect(got.status).toEqual(ref.status);
  });

  it("throws on a stream truncated mid-row", async () => {
    const truncated = BUF.subarray(0, BUF.length - 3);
    await expect(collect(chunked(truncated, [256]))).rejects.toThrow(/mid-row/);
  });

  describe("Int64 column is not transferred through a bigint allocation", () => {
    const original = DataView.prototype.getBigInt64;
    afterEach(() => {
      DataView.prototype.getBigInt64 = original;
    });

    it("never calls getBigInt64 while decoding", async () => {
      let calls = 0;
      // Spy that ALSO returns a correct value, so if the decoder regressed to
      // using it the column would still be right — the test would fail only on
      // the call count, pinpointing the allocation, not on a value mismatch.
      DataView.prototype.getBigInt64 = function (
        this: DataView,
        byteOffset: number,
        littleEndian?: boolean,
      ): bigint {
        calls++;
        return original.call(this, byteOffset, littleEndian);
      };

      const got = await collect(chunked(BUF, [1, 7, 13, 100, 3]));

      expect(calls).toBe(0);
      // sanity: ts still decoded correctly via the two-word copy
      expect(got.ts.length).toBe(N);
      expect(got.ts[0]).toBe(1700000000n * 1000n);
      expect(got.ts[N - 1]).toBe(BigInt(1700000000 + N - 1) * 1000n);
    });
  });
});
