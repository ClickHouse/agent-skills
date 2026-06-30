import { type Reader, advance } from "../readers/core.js";
import { readDateTime64P3 } from "../readers/datetime.js";
import { readFloat32, readFloat64 } from "../readers/floats.js";
import { readUInt8, readUInt32 } from "../readers/integers.js";

/**
 * Example: a table of IoT sensor readings — the dense, fixed-width NUMERIC case
 * that RowBinary is built for, and the headline of the RowBinary-vs-JSON
 * comparison in `iot.bench.ts`.
 *
 * Columns (the trigger — generate this reader when a result has these types):
 *   sensor_id   UInt32
 *   ts          DateTime64(3)
 *   temperature Float64
 *   humidity    Float64
 *   pressure    Float64
 *   battery     Float32
 *   status      UInt8
 *
 * Every column is fixed-width and there is not a single string or composite in
 * the row, so the whole record is a flat 4 + 8 + 8 + 8 + 8 + 4 + 1 = 41-byte
 * run. This is the shape where a JS RowBinary decoder beats `JSON.parse`: the
 * wire is ~1/3 the size and each field is one `DataView` read, versus JSON's
 * tokenize-and-number-parse over a much larger, key-repeating text.
 */
export type IotRow = {
  sensor_id: number;
  ts: Date;
  temperature: number;
  humidity: number;
  pressure: number;
  battery: number;
  status: number;
};

/**
 * API-combinator reader: correct and clear, one leaf reader per column. A fine
 * default; `readIotRowFast` is the monomorphized form `iot.bench.ts` measures.
 */
export const readIotRow: Reader<IotRow> = (s) => ({
  sensor_id: readUInt32(s),
  ts: readDateTime64P3(s),
  temperature: readFloat64(s),
  humidity: readFloat64(s),
  pressure: readFloat64(s),
  battery: readFloat32(s),
  status: readUInt8(s),
});

/**
 * Optimized {@link readIotRow}: every column is fixed-width, so the seven
 * separate bounds checks coalesce into one `advance(s, 41)` and each field is
 * read at a constant offset off that base — no per-field reader calls, no cursor
 * write-back between fields. Stays streaming-safe (one `advance`), so a row that
 * straddles a chunk boundary still rewinds and retries cleanly.
 *
 *   sensor_id    UInt32        @ o+0   getUint32
 *   ts           DateTime64(3) @ o+4   getBigInt64 (ms ticks -> Date)
 *   temperature  Float64       @ o+12  getFloat64
 *   humidity     Float64       @ o+20  getFloat64
 *   pressure     Float64       @ o+28  getFloat64
 *   battery      Float32       @ o+36  getFloat32
 *   status       UInt8         @ o+40  buf[o+40]
 */
export const readIotRowFast: Reader<IotRow> = (s) => {
  const { buf, view } = s;
  const o = advance(s, 41); // one bounds check for the whole 41-byte row
  const sensor_id = view.getUint32(o, true);
  // DateTime64(3): Int64 millisecond ticks; ms fits a JS number, so Number() is exact here.
  const ts = new Date(Number(view.getBigInt64(o + 4, true)));
  const temperature = view.getFloat64(o + 12, true);
  const humidity = view.getFloat64(o + 20, true);
  const pressure = view.getFloat64(o + 28, true);
  const battery = view.getFloat32(o + 36, true);
  const status = buf[o + 40]!;
  return { sensor_id, ts, temperature, humidity, pressure, battery, status };
};

/** Byte width of one fixed-width IoT row: 4 + 8 + 8 + 8 + 8 + 4 + 1. */
export const IOT_ROW_BYTES = 41;

/**
 * Columnar (struct-of-arrays) form of the IoT result: one typed array per
 * column instead of one object per row. `ts` is kept as epoch milliseconds in a
 * `Float64Array` (format the few you display; don't allocate 50k `Date`s).
 */
export type IotColumns = {
  sensor_id: Uint32Array;
  ts: Float64Array; // epoch ms
  temperature: Float64Array;
  humidity: Float64Array;
  pressure: Float64Array;
  battery: Float32Array;
  status: Uint8Array;
};

/**
 * Decode the whole IoT result into columns (SoA) rather than row objects (AoS).
 *
 * MEASURED (`iot.columnar.bench.ts`): ~4x faster than `readIotRowFast` over the
 * same buffer, and several times smaller in memory. The win is entirely from
 * what it does NOT do — no per-row object, no `Date`, no number boxing — so the
 * cost drops to one unboxed store per field. It is a NUMERIC win; it would not
 * help a string column (a JS string must be allocated either way).
 *
 * WHOLE-BUFFER ONLY: this needs the complete response in one `Buffer`. Because
 * every IoT column is fixed-width the row stride is known, so the exact row
 * count is `buf.length / IOT_ROW_BYTES` — one exact allocation per column, no
 * growth, no bounds check in the loop.
 *
 * Reach for this when the consumer is column-oriented (aggregate / filter /
 * scan / plot / feed a Worker or WASM kernel via the transferable
 * `ArrayBuffer`s). Prefer the row reader when downstream code is row-shaped.
 */
export function decodeIotColumnar(buf: Buffer): IotColumns {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = (buf.length / IOT_ROW_BYTES) | 0;
  // Hold each column in a LOCAL so the fill loop writes through a register-held
  // typed-array reference, not a property load off a result object every
  // iteration; assemble the object once, on return.
  const sensor_id = new Uint32Array(n);
  const ts = new Float64Array(n);
  const temperature = new Float64Array(n);
  const humidity = new Float64Array(n);
  const pressure = new Float64Array(n);
  const battery = new Float32Array(n);
  const status = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i < n; i++) {
    sensor_id[i] = view.getUint32(o, true); // UInt32
    ts[i] = Number(view.getBigInt64(o + 4, true)); // DateTime64(3) ms ticks
    temperature[i] = view.getFloat64(o + 12, true); // Float64
    humidity[i] = view.getFloat64(o + 20, true); // Float64
    pressure[i] = view.getFloat64(o + 28, true); // Float64
    battery[i] = view.getFloat32(o + 36, true); // Float32
    status[i] = buf[o + 40]!; // UInt8
    o += IOT_ROW_BYTES;
  }
  return { sensor_id, ts, temperature, humidity, pressure, battery, status };
}

/**
 * Hybrid accessor: reconstruct a single {@link IotRow} object from columns on
 * demand (here is where `ts` becomes a `Date`). Store columnar, and pay the
 * object/`Date` cost only for the rows a caller actually touches — best when
 * row access is sparse.
 */
export function iotRowAt(c: IotColumns, i: number): IotRow {
  return {
    sensor_id: c.sensor_id[i]!,
    ts: new Date(c.ts[i]!),
    temperature: c.temperature[i]!,
    humidity: c.humidity[i]!,
    pressure: c.pressure[i]!,
    battery: c.battery[i]!,
    status: c.status[i]!,
  };
}
