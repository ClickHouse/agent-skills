import { bench, describe } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import { type IotRow, readIotRowFast } from "../src/examples/iot.js";

/**
 * WASM headroom probe — NOT a WASM implementation, but the measurement that
 * decides whether writing one is worth it.
 *
 * A WASM parser can read bytes, but it CANNOT allocate JS objects / strings /
 * BigInts / Dates — those must be materialized on the JS side whatever decodes
 * the bytes. So the maximum a WASM parser could ever shave off our current
 * row-object decode is bounded by:
 *
 *     (full row-object decode time) − (unavoidable JS-side materialization)
 *
 * We bracket that headroom with three decoders over the SAME IoT buffer (the
 * best case for RowBinary — every column fixed-width numeric):
 *
 *   1. rows      — the current fast reader: builds {…} objects + Date per row.
 *   2. columnar  — same reads, written into preallocated typed arrays, NO
 *                  per-row objects. The "different output contract" a WASM
 *                  parser would target.
 *   3. parseOnly — same reads, accumulated into a scalar checksum, allocates
 *                  NOTHING. The pure byte-arithmetic floor: a WASM parser
 *                  cannot beat this slice by much (V8 already compiles DataView
 *                  reads to native loads), and still has to pay it.
 *
 * Read the gaps: rows→parseOnly is the materialization WASM can't remove;
 * rows→columnar is the win available in plain JS by changing the output shape.
 */
const N = 50_000;
const SELECT =
  `SELECT toUInt32(number % 1000) AS sensor_id, ` +
  `toDateTime64(1700000000 + number, 3) AS ts, ` +
  `20 + (number % 1500) / 100 AS temperature, ` +
  `30 + (number % 7000) / 100 AS humidity, ` +
  `980 + (number % 6000) / 100 AS pressure, ` +
  `toFloat32(3 + (number % 200) / 100) AS battery, ` +
  `toUInt8(number % 4) AS status ` +
  `FROM numbers(${N})`;
const BUF = await query(`${SELECT} FORMAT RowBinary`);
const ROW_BYTES = 41;

// 1. Current output contract: an array of row objects.
function decodeRows(): IotRow[] {
  const s = new Cursor(BUF);
  const out: IotRow[] = [];
  while (s.pos < s.buf.length) out.push(readIotRowFast(s));
  return out;
}

type Columns = {
  sensor_id: Uint32Array;
  ts: Float64Array; // epoch ms
  temperature: Float64Array;
  humidity: Float64Array;
  pressure: Float64Array;
  battery: Float32Array;
  status: Uint8Array;
};

// 2. Columnar contract: straight into typed arrays, no per-row objects.
function decodeColumnar(): Columns {
  const view = new DataView(BUF.buffer, BUF.byteOffset, BUF.byteLength);
  const n = (BUF.length / ROW_BYTES) | 0;
  const c: Columns = {
    sensor_id: new Uint32Array(n),
    ts: new Float64Array(n),
    temperature: new Float64Array(n),
    humidity: new Float64Array(n),
    pressure: new Float64Array(n),
    battery: new Float32Array(n),
    status: new Uint8Array(n),
  };
  let o = 0;
  for (let i = 0; i < n; i++) {
    c.sensor_id[i] = view.getUint32(o, true);
    c.ts[i] = Number(view.getBigInt64(o + 4, true));
    c.temperature[i] = view.getFloat64(o + 12, true);
    c.humidity[i] = view.getFloat64(o + 20, true);
    c.pressure[i] = view.getFloat64(o + 28, true);
    c.battery[i] = view.getFloat32(o + 36, true);
    c.status[i] = BUF[o + 40]!;
    o += ROW_BYTES;
  }
  return c;
}

// 3. Pure parse floor: read everything, allocate nothing, fold into a checksum.
let sink = 0;
function parseOnly(): number {
  const view = new DataView(BUF.buffer, BUF.byteOffset, BUF.byteLength);
  const n = (BUF.length / ROW_BYTES) | 0;
  let acc = 0;
  let o = 0;
  for (let i = 0; i < n; i++) {
    acc += view.getUint32(o, true);
    acc += Number(view.getBigInt64(o + 4, true));
    acc += view.getFloat64(o + 12, true);
    acc += view.getFloat64(o + 20, true);
    acc += view.getFloat64(o + 28, true);
    acc += view.getFloat32(o + 36, true);
    acc += BUF[o + 40]!;
    o += ROW_BYTES;
  }
  return (sink = acc); // observable, so V8 can't elide the reads
}

// sanity: all three agree on row count / a sampled value
{
  const rows = decodeRows();
  const cols = decodeColumnar();
  if (rows.length !== N || cols.sensor_id.length !== N)
    throw new Error("headroom: row count");
  if (rows[123]!.temperature !== cols.temperature[123])
    throw new Error("headroom: value mismatch");
  parseOnly();
  if (!Number.isFinite(sink)) throw new Error("headroom: checksum");
}

describe("WASM headroom on IoT RowBinary (best case for RowBinary)", () => {
  bench("rows — current fast reader (objects + Date)", () => {
    decodeRows();
  });
  bench("columnar — into typed arrays (no per-row objects)", () => {
    decodeColumnar();
  });
  bench("parseOnly — reads only, zero allocation (the WASM floor)", () => {
    parseOnly();
  });
});
