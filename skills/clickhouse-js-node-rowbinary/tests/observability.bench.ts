import { bench, describe } from "vitest";
import { query } from "./clickhouse.js";
import { type Reader, Cursor } from "../src/readers/core.js";
import {
  type ObsRow,
  readObsRow,
  readObsRowFast,
} from "../src/examples/observability.js";

/**
 * API-combinator `readObsRow` vs flattened `readObsRowFast` over the same large
 * buffer. The gotcha-heavy schema is also the most composite-heavy (Variant +
 * Map + nested Tuple array + Nullable array), so it's where the flatten tier —
 * coalesced `advance()` over the 33-byte fixed head, inlined reads, pre-sized
 * arrays, `formatUUIDTable` — should pay the most.
 */
const N = 20_000;
const BUF = await query(
  `SELECT
    toUInt64(number) AS id,
    toDateTime64('2021-01-01 00:00:00', 3, 'UTC') + number AS ts,
    CAST(number % 4 + 1 AS Enum8('debug'=1,'info'=2,'warn'=3,'error'=4)) AS level,
    generateUUIDv4() AS trace_id,
    multiIf(
      number % 3 = 0, CAST(toInt64(number) AS Variant(String, Int64, Float64)),
      number % 3 = 1, CAST(concat('s', toString(number)) AS Variant(String, Int64, Float64)),
      CAST(toFloat64(number) / 2 AS Variant(String, Int64, Float64))
    ) AS payload,
    CAST(map('env','prod','az',toString(number % 3)) AS Map(LowCardinality(String), String)) AS tags,
    arrayMap(x -> CAST(tuple(concat('m', toString(x)), toFloat64(x)/10) AS Tuple(name LowCardinality(String), value Float64)), range(number % 3)) AS metrics,
    arrayMap(x -> CAST(if(x % 2 = 0, toInt64(x)*1000000000, NULL) AS Nullable(Int64)), range(number % 4)) AS attrs
  FROM numbers(${N})
  SETTINGS allow_experimental_variant_type=1, allow_suspicious_variant_types=1, allow_suspicious_low_cardinality_types=1
  FORMAT RowBinary`,
);

function decodeAll(read: Reader<ObsRow>): ObsRow[] {
  const s = new Cursor(BUF);
  const out: ObsRow[] = [];
  while (s.pos < s.buf.length) out.push(read(s));
  return out;
}

const norm = (rows: ObsRow[]): string =>
  JSON.stringify(rows, (_k, v) =>
    typeof v === "bigint" ? `${v}n` : v instanceof Map ? [...v] : v,
  );
{
  const a = decodeAll(readObsRow);
  const b = decodeAll(readObsRowFast);
  if (a.length !== N)
    throw new Error(`observability: decoded ${a.length} rows, expected ${N}`);
  if (norm(a) !== norm(b))
    throw new Error("observability: API vs fast mismatch");
}

describe("example observability: API vs optimized", () => {
  bench("API (combinators)", () => {
    decodeAll(readObsRow);
  });
  bench("optimized (flattened)", () => {
    decodeAll(readObsRowFast);
  });
});
