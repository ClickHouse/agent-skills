import { bench, describe } from "vitest";
import { query } from "./clickhouse.js";
import { type Reader, Cursor } from "../src/readers/core.js";
import {
  type IotRow,
  readIotRow,
  readIotRowFast,
} from "../src/examples/iot.js";

/**
 * Benchmark: RowBinary vs JSON for a table of IoT sensor readings — the
 * dense-numeric, fixed-width shape RowBinary exists for. The SKILL's
 * format-choice guidance says reach for JSON when the result is string-heavy and
 * for RowBinary when it is "high-volume fixed-width numeric"; this is the latter,
 * so we measure the gap honestly against the JSON formats a knowledgeable user
 * would actually choose:
 *
 *   - JSONEachRow         — newline-delimited objects (keys repeated every row)
 *   - JSONCompactEachRow  — newline-delimited arrays (no repeated keys; smaller)
 *
 * For each JSON format we use the fastest idiomatic decode: splice the rows into
 * one `[...]` document and hand it to V8's native `JSON.parse` in a single call.
 */
const N = 50_000;

// Same rows, three formats. Deterministic, dense-numeric IoT readings.
const SELECT =
  `SELECT toUInt32(number % 1000) AS sensor_id, ` +
  `toDateTime64(1700000000 + number, 3) AS ts, ` +
  `20 + (number % 1500) / 100 AS temperature, ` +
  `30 + (number % 7000) / 100 AS humidity, ` +
  `980 + (number % 6000) / 100 AS pressure, ` +
  `toFloat32(3 + (number % 200) / 100) AS battery, ` +
  `toUInt8(number % 4) AS status ` +
  `FROM numbers(${N})`;

const RB_BUF = await query(`${SELECT} FORMAT RowBinary`);
const JSON_BUF = await query(`${SELECT} FORMAT JSONEachRow`);
const JSON_COMPACT_BUF = await query(`${SELECT} FORMAT JSONCompactEachRow`);

// --- decoders ---------------------------------------------------------------

function decodeRowBinary(read: Reader<IotRow>): IotRow[] {
  const s = new Cursor(RB_BUF);
  const out: IotRow[] = [];
  while (s.pos < s.buf.length) out.push(read(s));
  return out;
}

// Wrap newline-delimited JSON rows into one array and parse in a single call —
// the fastest way to drive V8's native JSON.parse over a whole response.
function decodeJsonArray(buf: Buffer): unknown[] {
  const text = buf.toString("utf8");
  return JSON.parse(`[${text.trimEnd().replaceAll("\n", ",")}]`);
}

// --- correctness cross-check (runs once at load) ----------------------------

const COLS: (keyof IotRow)[] = [
  "sensor_id",
  "temperature",
  "humidity",
  "pressure",
  "battery",
  "status",
];
{
  const rb = decodeRowBinary(readIotRowFast);
  const api = decodeRowBinary(readIotRow);
  const je = decodeJsonArray(JSON_BUF) as Record<string, number | string>[];
  const jc = decodeJsonArray(JSON_COMPACT_BUF) as (number | string)[][];

  if (rb.length !== N)
    throw new Error(`RowBinary: ${rb.length} rows, expected ${N}`);
  if (je.length !== N)
    throw new Error(`JSONEachRow: ${je.length} rows, expected ${N}`);
  if (jc.length !== N)
    throw new Error(`JSONCompactEachRow: ${jc.length} rows, expected ${N}`);

  // API reader and fast reader must agree exactly.
  if (JSON.stringify(api) !== JSON.stringify(rb))
    throw new Error("iot: API vs fast mismatch");

  // RowBinary (binary float) and JSON (decimal text -> float) must agree to a
  // tiny epsilon on every numeric column, spot-checked across the result.
  const order: (keyof IotRow)[] = [
    "sensor_id",
    "ts",
    "temperature",
    "humidity",
    "pressure",
    "battery",
    "status",
  ];
  for (const i of [0, 1, 123, 4999, N - 1]) {
    for (const c of COLS) {
      const a = rb[i]![c] as number;
      const b = Number(je[i]![c]);
      const d = Number(jc[i]![order.indexOf(c)]);
      const tol = c === "battery" ? 1e-2 : 1e-9; // Float32 battery has less precision
      if (Math.abs(a - b) > tol || Math.abs(a - d) > tol) {
        throw new Error(
          `iot: ${c}@${i} mismatch rb=${a} json=${b} compact=${d}`,
        );
      }
    }
  }

  const mb = (b: Buffer) => (b.length / 1e6).toFixed(2);
  const perRow = (b: Buffer) => (b.length / N).toFixed(1);
  console.log(
    `\n  IoT readings — ${N.toLocaleString()} rows, wire size on the HTTP response:\n` +
      `    RowBinary          ${mb(RB_BUF)} MB  (${perRow(RB_BUF)} B/row)\n` +
      `    JSONCompactEachRow ${mb(JSON_COMPACT_BUF)} MB  (${perRow(JSON_COMPACT_BUF)} B/row)  ${(JSON_COMPACT_BUF.length / RB_BUF.length).toFixed(1)}x\n` +
      `    JSONEachRow        ${mb(JSON_BUF)} MB  (${perRow(JSON_BUF)} B/row)  ${(JSON_BUF.length / RB_BUF.length).toFixed(1)}x\n`,
  );
}

// --- benchmarks -------------------------------------------------------------

describe("IoT readings: RowBinary vs JSON decode throughput", () => {
  bench("RowBinary — optimized (monomorphized)", () => {
    decodeRowBinary(readIotRowFast);
  });
  bench("RowBinary — API (combinators)", () => {
    decodeRowBinary(readIotRow);
  });
  bench("JSONCompactEachRow — JSON.parse", () => {
    decodeJsonArray(JSON_COMPACT_BUF);
  });
  bench("JSONEachRow — JSON.parse", () => {
    decodeJsonArray(JSON_BUF);
  });
});
