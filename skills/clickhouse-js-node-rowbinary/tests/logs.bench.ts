import { gzipSync, zstdCompressSync } from "node:zlib";
import { bench, describe } from "vitest";
import { query } from "./clickhouse.js";
import { type Reader, Cursor } from "../src/readers/core.js";
import {
  type LogRow,
  readLogRow,
  readLogRowFast,
} from "../src/examples/logs.js";

/**
 * Benchmark: RowBinary vs JSON for a STRING-HEAVY application log table — the
 * honest counter-case. The SKILL's format-choice guidance says prefer a `JSON*`
 * format when the result is mostly strings consumed wholesale, because V8's
 * native `JSON.parse` builds JS strings in optimized C++ faster than a JS-level
 * RowBinary string decoder, and JSON's repetitive keys compress away on the
 * wire. This measures both halves of that claim and is expected to show JSON
 * WINNING — the result that makes the skill's "don't use RowBinary here" advice
 * trustworthy.
 */
const N = 50_000;

// Realistic log lines: repeated templates (compress well) with varying values,
// two LowCardinality columns, a high-cardinality hex trace_id. Deterministic.
const SELECT =
  `SELECT ` +
  `toDateTime(1700000000 + number) AS ts, ` +
  `['INFO','INFO','INFO','WARN','ERROR','DEBUG'][number % 6 + 1]::LowCardinality(String) AS level, ` +
  `['api','auth','db','cache','worker','scheduler'][number % 6 + 1]::LowCardinality(String) AS service, ` +
  `concat('handled ', ['GET','POST','PUT'][number % 3 + 1], ' /api/v1/resource/', toString(number % 200), ` +
  `' in ', toString(number % 1000), 'ms status=', toString([200,200,200,404,500][number % 5 + 1])) AS message, ` +
  `lower(hex(MD5(toString(number)))) AS trace_id ` +
  `FROM numbers(${N})`;

const RB_BUF = await query(`${SELECT} FORMAT RowBinary`);
const JSON_BUF = await query(`${SELECT} FORMAT JSONEachRow`);
const JSON_COMPACT_BUF = await query(`${SELECT} FORMAT JSONCompactEachRow`);

// --- decoders ---------------------------------------------------------------

function decodeRowBinary(read: Reader<LogRow>): LogRow[] {
  const s = new Cursor(RB_BUF);
  const out: LogRow[] = [];
  while (s.pos < s.buf.length) out.push(read(s));
  return out;
}

function decodeJsonArray(buf: Buffer): unknown[] {
  return JSON.parse(
    `[${buf.toString("utf8").trimEnd().replaceAll("\n", ",")}]`,
  );
}

// --- correctness cross-check + wire-size report (runs at load) --------------

const COLS: (keyof LogRow)[] = ["level", "service", "message", "trace_id"];
{
  const rb = decodeRowBinary(readLogRowFast);
  const api = decodeRowBinary(readLogRow);
  const je = decodeJsonArray(JSON_BUF) as Record<string, string>[];
  const order: (keyof LogRow)[] = [
    "ts",
    "level",
    "service",
    "message",
    "trace_id",
  ];
  const jc = decodeJsonArray(JSON_COMPACT_BUF) as string[][];

  if (rb.length !== N)
    throw new Error(`RowBinary: ${rb.length} rows, expected ${N}`);
  if (JSON.stringify(api) !== JSON.stringify(rb))
    throw new Error("logs: API vs fast mismatch");
  for (const i of [0, 1, 123, 4999, N - 1]) {
    for (const c of COLS) {
      if (rb[i]![c] !== je[i]![c])
        throw new Error(`logs: ${c}@${i} RowBinary vs JSON mismatch`);
      if (rb[i]![c] !== jc[i]![order.indexOf(c)])
        throw new Error(`logs: ${c}@${i} RowBinary vs compact mismatch`);
    }
  }

  const mb = (b: Buffer) => (b.length / 1e6).toFixed(2);
  // Compressed wire size: what gzip / zstd on the HTTP response would send.
  const gz = (b: Buffer) => (gzipSync(b, { level: 6 }).length / 1e6).toFixed(2);
  const zs = (b: Buffer) => (zstdCompressSync(b).length / 1e6).toFixed(2);
  const row = (name: string, b: Buffer) =>
    `    ${name.padEnd(18)} raw ${mb(b)} MB   gzip ${gz(b)} MB   zstd ${zs(b)} MB`;
  console.log(
    `\n  Application logs — ${N.toLocaleString()} rows, wire size (raw + compressed):\n` +
      `${row("RowBinary", RB_BUF)}\n` +
      `${row("JSONCompactEachRow", JSON_COMPACT_BUF)}\n` +
      `${row("JSONEachRow", JSON_BUF)}\n`,
  );
}

// --- benchmarks -------------------------------------------------------------

describe("Application logs (string-heavy): RowBinary vs JSON decode throughput", () => {
  bench("JSONEachRow — JSON.parse", () => {
    decodeJsonArray(JSON_BUF);
  });
  bench("JSONCompactEachRow — JSON.parse", () => {
    decodeJsonArray(JSON_COMPACT_BUF);
  });
  bench("RowBinary — optimized (monomorphized)", () => {
    decodeRowBinary(readLogRowFast);
  });
  bench("RowBinary — API (combinators)", () => {
    decodeRowBinary(readLogRow);
  });
});
