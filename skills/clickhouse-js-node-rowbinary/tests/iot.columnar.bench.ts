import { bench, describe } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import {
  type IotRow,
  decodeIotColumnar,
  iotRowAt,
  readIotRowFast,
} from "../src/examples/iot.js";

/**
 * Benchmark: row-objects (AoS, `readIotRowFast`) vs columnar (SoA,
 * `decodeIotColumnar`) over the same fixed-width IoT buffer. Columnar removes
 * the per-row object + `Date` allocation that dominates a numeric decode, for a
 * ~4x win — the "free 4x, in plain JS" the WASM investigation surfaced (see
 * `case-studies/wasm-vs-js.md`).
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

function decodeRows(): IotRow[] {
  const s = new Cursor(BUF);
  const out: IotRow[] = [];
  while (s.pos < s.buf.length) out.push(readIotRowFast(s));
  return out;
}

// correctness: columnar (via the lazy row accessor) must equal the row decode
{
  const rows = decodeRows();
  const cols = decodeIotColumnar(BUF);
  if (rows.length !== N || cols.sensor_id.length !== N)
    throw new Error("columnar: row count");
  for (const i of [0, 1, 123, 4999, N - 1]) {
    if (JSON.stringify(rows[i]) !== JSON.stringify(iotRowAt(cols, i))) {
      throw new Error(`columnar: row ${i} mismatch`);
    }
  }
}

describe("IoT decode: row-objects vs columnar", () => {
  bench("rows — readIotRowFast (objects + Date)", () => {
    decodeRows();
  });
  bench("columnar — decodeIotColumnar (typed arrays)", () => {
    decodeIotColumnar(BUF);
  });
});
