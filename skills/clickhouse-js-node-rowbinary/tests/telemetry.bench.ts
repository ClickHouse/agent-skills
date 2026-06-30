import { bench, describe } from "vitest";
import { query } from "./clickhouse.js";
import { type Reader, Cursor } from "../src/readers/core.js";
import {
  type TelemetryRow,
  readTelemetryRow,
  readTelemetryRowFast,
} from "../src/examples/telemetry.js";

/**
 * Benchmark: API-combinator `readTelemetryRow` vs fully monomorphized
 * `readTelemetryRowFast` over the same large buffer. The most composite-heavy
 * example — Map + Array + Nullable + named Tuple — so the API version builds four
 * closures per row plus a keyed object build; the biggest expected win.
 */
const N = 20_000;
const BUF = await query(
  `SELECT concat('h', toString(number)) AS host, ` +
    `map('env', 'prod', 'az', toString(number % 3)) AS tags, ` +
    `arrayMap(x -> toFloat64(x) / 10, range(number % 5)) AS cpu, ` +
    `CAST(if(number % 2 = 0, 'us', NULL) AS Nullable(String)) AS region, ` +
    `CAST(tuple(toUInt32(number), toUInt16(number % 100)) AS Tuple(start UInt32, count UInt16)) AS window ` +
    `FROM numbers(${N}) FORMAT RowBinary`,
);

function decodeAll(read: Reader<TelemetryRow>): TelemetryRow[] {
  const s = new Cursor(BUF);
  const out: TelemetryRow[] = [];
  while (s.pos < s.buf.length) out.push(read(s));
  return out;
}

const norm = (rows: TelemetryRow[]): string =>
  JSON.stringify(rows, (_k, v) => (v instanceof Map ? [...v] : v));
{
  const a = decodeAll(readTelemetryRow);
  const b = decodeAll(readTelemetryRowFast);
  if (a.length !== N)
    throw new Error(`telemetry: decoded ${a.length} rows, expected ${N}`);
  if (norm(a) !== norm(b)) throw new Error("telemetry: API vs fast mismatch");
}

describe("example telemetry: API vs optimized", () => {
  bench("API (combinators)", () => {
    decodeAll(readTelemetryRow);
  });
  bench("optimized (monomorphized)", () => {
    decodeAll(readTelemetryRowFast);
  });
});
