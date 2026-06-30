/**
 * Streaming COLUMNAR decode for an all-numeric, fixed-width RowBinary result —
 * one concrete example reader that ties together the three wins this skill keeps
 * pointing at. The schema is hard-coded on purpose: a real columnar reader is
 * MONOMORPHIZED to its result, so the row loop is straight-line constant-offset
 * reads with no per-field dispatch. Generate one shaped like this per schema.
 *
 * The example schema (`sensor_id UInt32, ts DateTime64(3), value Float64,
 * quality Float32, status UInt8`) — every column fixed-width, stride 25 bytes:
 *
 *   sensor_id  UInt32         @ o+0   getUint32     -> Uint32Array
 *   ts         DateTime64(3)  @ o+4   2x getUint32  -> BigInt64Array (raw ms ticks)
 *   value      Float64        @ o+12  getFloat64    -> Float64Array
 *   quality    Float32        @ o+20  getFloat32    -> Float32Array
 *   status     UInt8          @ o+24  buf[o+24]     -> Uint8Array
 *
 * The three wins:
 *
 *  1. COLUMNAR (struct-of-arrays). One typed array per column, not one object
 *     per row — removes the per-row object / `Date` / number-boxing allocation
 *     that dominates a numeric decode (~4x in plain JS; see `src/examples/iot.ts`
 *     and `tests/iot.columnar.bench.ts`). Keep `ts` as raw `BigInt64Array` ticks
 *     and make a `Date` lazily, per displayed row — never allocate 50k `Date`s.
 *     The `Int64` column is itself filled WITHOUT allocating a bigint per row:
 *     copy the two little-endian 32-bit words straight into a `Uint32Array` view
 *     over its buffer (`getBigInt64` would box a bigint each row); the bigint is
 *     materialized lazily, only when the consumer reads `ts[i]`.
 *
 *  2. TRANSFERABLE. Each column is a fresh, exactly-sized typed array that OWNS
 *     its `ArrayBuffer` at offset 0, so a batch ships to a Worker / WASM kernel
 *     zero-copy: `postMessage(batch, columns.map(c => c.buffer))`.
 *
 *  3. RESPECTS INCOMPLETE BUFFERS (streaming). Because the stride is constant,
 *     honoring a partial trailing row is pure ARITHMETIC: the number of complete
 *     rows in the buffer is `(work.length / STRIDE) | 0`. No `advance()`, no
 *     `NeedMoreData`, no throw/restart — the leftover `work.length % STRIDE` bytes
 *     just carry to the next chunk. Strictly cheaper than the row-oriented
 *     `streamRowBatches`, which re-decodes the partial row on every boundary.
 *
 * SCOPE: fixed-width numeric columns only — the ClickHouse types with a 1:1
 * native TypedArray (`Int8/16/32/64`, `UInt8/16/32/64`, `Float32/64`). Anything
 * whose value isn't one native-typed number has no constant stride to divide by
 * (`String`/`Array`/`Map`/`Tuple`) or no 1:1 array (`Int128`+, `Decimal*`,
 * `BFloat16`); decode those row-wise. `Bool`/`Enum`/`Date*`/`DateTime*` ride
 * their underlying int here for the RAW value.
 */

/** One decoded batch of the example schema: `rows` complete rows, one typed array per column. */
export interface SensorColumnBatch {
  /** Number of complete rows decoded in this batch. */
  rows: number;
  columns: {
    sensor_id: Uint32Array;
    ts: BigInt64Array; // raw DateTime64(3) ms ticks
    value: Float64Array;
    quality: Float32Array;
    status: Uint8Array;
  };
}

/** Byte stride of one fixed-width row: 4 + 8 + 8 + 4 + 1. */
const STRIDE = 25;

const EMPTY_CHUNK = Buffer.alloc(0);

/**
 * Stream a chunked RowBinary response of the example schema into columnar
 * batches: one `{ rows, columns }` per incoming chunk, holding exactly the rows
 * that completed within it.
 *
 * BACKPRESSURE: a pull stream — the next chunk is requested only when the
 * consumer asks for the next batch. SMALL CHUNKS: tiny chunks mean tiny batches
 * (more allocations, worse Worker amortization); compose `coalesceChunks` (from
 * `./stream.js`) in front to merge them up to a target size first.
 */
export async function* streamSensorColumns(
  chunks: AsyncIterable<Uint8Array>,
): AsyncGenerator<SensorColumnBatch, void, undefined> {
  let carry: Buffer = EMPTY_CHUNK;
  for await (const chunk of chunks) {
    // Wrap as a Buffer VIEW over the chunk's bytes — no copy (a Buffer made from
    // an ArrayBuffer slice shares it). We own the chunk for the life of this
    // generator, so holding a view into it is safe.
    const incoming = Buffer.from(
      chunk.buffer,
      chunk.byteOffset,
      chunk.byteLength,
    );
    const work =
      carry.length === 0 ? incoming : Buffer.concat([carry, incoming]);

    // Complete rows available right now — pure arithmetic, since STRIDE is fixed.
    const n = (work.length / STRIDE) | 0;
    if (n > 0) {
      const view = new DataView(work.buffer, work.byteOffset, work.byteLength);
      const sensor_id = new Uint32Array(n);
      const ts = new BigInt64Array(n);
      // Uint32 view over ts's OWN bytes: 2 little-endian words per Int64,
      // [lo, hi, lo, hi, ...]. Filling ts through this view copies the raw bytes
      // and skips the per-row bigint allocation `getBigInt64` would force; the
      // bigint is materialized lazily, only for rows the consumer indexes.
      const tsWords = new Uint32Array(ts.buffer);
      const value = new Float64Array(n);
      const quality = new Float32Array(n);
      const status = new Uint8Array(n);
      for (let i = 0, o = 0; i < n; i++, o += STRIDE) {
        sensor_id[i] = view.getUint32(o, true); // UInt32        @ o+0
        // DateTime64(3) Int64 @ o+4: two LE 32-bit words, no bigint allocated.
        tsWords[i * 2] = view.getUint32(o + 4, true); // low word
        tsWords[i * 2 + 1] = view.getUint32(o + 8, true); // high word
        value[i] = view.getFloat64(o + 12, true); // Float64       @ o+12
        quality[i] = view.getFloat32(o + 20, true); // Float32       @ o+20
        status[i] = work[o + 24]!; // UInt8         @ o+24
      }
      yield { rows: n, columns: { sensor_id, ts, value, quality, status } };
    }
    // Carry the partial trailing row (if any) to the next chunk.
    carry = work.subarray(n * STRIDE);
  }
  if (carry.length > 0) {
    throw new Error(
      `RowBinary stream ended mid-row: ${carry.length} trailing byte(s) left undecoded`,
    );
  }
}
