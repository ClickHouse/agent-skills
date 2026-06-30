import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import {
  type ObsRow,
  readObsRow,
  readObsRowFast,
} from "../src/examples/observability.js";
import { readRows } from "../src/readers/rows.js";

/**
 * The gotcha-heavy example end to end: a single SELECT (no table needed) builds
 * rows with `Variant`, `DateTime64(3)`, `Map(LowCardinality(String), String)`,
 * `Array(Tuple(LowCardinality(String), Float64))`, `Array(Nullable(Int64))`,
 * `Enum8`, and `UUID`, then both readers decode it. The experimental types need
 * their `SETTINGS` flags on the query.
 */
const SQL = (n: number): string =>
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
  FROM numbers(${n})
  SETTINGS allow_experimental_variant_type=1, allow_suspicious_variant_types=1, allow_suspicious_low_cardinality_types=1
  FORMAT RowBinary`;

describe("example: observability (Variant / DateTime64 / LowCardinality / nested)", () => {
  it("API and optimized readers agree, consume exactly, and decode the gotchas", async () => {
    const buf = await query(SQL(64));

    const a = new Cursor(buf);
    const viaApi: ObsRow[] = readRows(readObsRow)(a);
    expect(a.pos, "API reader consumes the whole buffer").toBe(a.buf.length);

    const b = new Cursor(buf);
    const viaFast: ObsRow[] = readRows(readObsRowFast)(b);
    expect(b.pos, "fast reader consumes the whole buffer").toBe(b.buf.length);

    // The optimized reader must produce byte-identical results to the API one.
    expect(viaFast).toEqual(viaApi);
    expect(viaApi).toHaveLength(64);

    // Spot-check the gotchas on the first rows.
    expect(viaApi[0]!.id).toBe(0n); // UInt64 -> bigint
    expect(viaApi[0]!.ts).toBe("2021-01-01T00:00:00.000Z"); // DateTime64(3)
    expect(viaApi[0]!.level).toBe(1); // Enum8 underlying int ('debug')
    expect(viaApi[0]!.tags).toEqual(
      new Map([
        ["env", "prod"],
        ["az", "0"],
      ]),
    );
    expect(viaApi[0]!.metrics).toEqual([]);
    expect(viaApi[0]!.attrs).toEqual([]);

    // Variant active type rotates by row — proves the sort-by-type-name
    // discriminant mapping (0=Float64, 1=Int64, 2=String) is right.
    expect(viaApi[0]!.payload).toBe(0n); // number%3==0 -> Int64
    expect(viaApi[1]!.payload).toBe("s1"); // number%3==1 -> String
    expect(viaApi[2]!.payload).toBe(1); // number==2 -> Float64 1.0

    // Nested + Nullable + wide int.
    expect(viaApi[2]!.metrics).toEqual([
      { name: "m0", value: 0 },
      { name: "m1", value: 0.1 },
    ]);
    expect(viaApi[1]!.attrs).toEqual([0n]);
    expect(viaApi[2]!.attrs).toEqual([0n, null]);

    // trace_id is a canonical UUID string.
    expect(viaApi[0]!.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
