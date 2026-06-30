import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import {
  type TelemetryRow,
  readTelemetryRow,
} from "../src/examples/telemetry.js";
import { readRows } from "../src/readers/rows.js";

/**
 * Runs the `telemetry` example end to end (Map / Array / Nullable / named
 * Tuple). Populated via `JSONEachRow`; the second row exercises every empty /
 * NULL branch at once (empty Map, empty Array, NULL region).
 */
describe("example: telemetry (composite columns via JSONEachRow)", () => {
  it("creates, populates, and reads back through readTelemetryRow", async () => {
    const t = "rb_example_telemetry";
    await query(`DROP TABLE IF EXISTS ${t}`);
    await query(
      `CREATE TABLE ${t} (` +
        `host String, ` +
        `tags Map(String, String), ` +
        `cpu Array(Float64), ` +
        `region Nullable(String), ` +
        `window Tuple(start UInt32, count UInt16)` +
        `) ENGINE = Memory`,
    );
    try {
      const rows = [
        {
          host: "a",
          tags: { env: "prod", az: "1" },
          cpu: [0.5, 0.25],
          region: "us",
          window: { start: 1000, count: 3 },
        },
        {
          host: "b",
          tags: {},
          cpu: [],
          region: null,
          window: { start: 2000, count: 0 },
        },
      ];
      await query(
        `INSERT INTO ${t} FORMAT JSONEachRow\n` +
          rows.map((r) => JSON.stringify(r)).join("\n"),
      );

      const r = new Cursor(
        await query(
          `SELECT host, tags, cpu, region, window FROM ${t} ORDER BY host FORMAT RowBinary`,
        ),
      );
      const out: TelemetryRow[] = readRows(readTelemetryRow)(r);
      expect(out).toEqual([
        {
          host: "a",
          tags: new Map([
            ["env", "prod"],
            ["az", "1"],
          ]),
          cpu: [0.5, 0.25],
          region: "us",
          window: { start: 1000, count: 3 },
        },
        {
          host: "b",
          tags: new Map(),
          cpu: [],
          region: null,
          window: { start: 2000, count: 0 },
        },
      ]);
      expect(r.pos).toBe(r.buf.length);
    } finally {
      await query(`DROP TABLE IF EXISTS ${t}`);
    }
  });
});
