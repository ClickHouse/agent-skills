import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import { type EventRow, readEventRow } from "../src/examples/events.js";
import { readRows } from "../src/readers/rows.js";

/**
 * Runs the `events` example end to end: CREATE a table, populate it (here via
 * `JSONEachRow` — an INSERT carries its rows in the same HTTP body after the
 * FORMAT clause), SELECT it back `FORMAT RowBinary`, and decode with the reader
 * imported from `src/examples/events.ts`. ENGINE = Memory + a finally-drop keeps
 * re-runs clean; the SELECT's ORDER BY gives a stable order to assert against.
 */
describe("example: events (scalars via JSONEachRow)", () => {
  it("creates, populates, and reads back through readEventRow", async () => {
    const t = "rb_example_events";
    await query(`DROP TABLE IF EXISTS ${t}`);
    await query(
      `CREATE TABLE ${t} (id UInt64, name String, ts DateTime('UTC')) ENGINE = Memory`,
    );
    try {
      const rows = [
        { id: 1, name: "alpha", ts: "2021-01-01 00:00:00" },
        { id: 2, name: "bravo", ts: "2021-06-15 12:30:00" },
        { id: 3, name: "", ts: "1970-01-01 00:00:00" },
      ];
      await query(
        `INSERT INTO ${t} FORMAT JSONEachRow\n` +
          rows.map((r) => JSON.stringify(r)).join("\n"),
      );

      const r = new Cursor(
        await query(
          `SELECT id, name, ts FROM ${t} ORDER BY id FORMAT RowBinary`,
        ),
      );
      const out: EventRow[] = readRows(readEventRow)(r);
      expect(out).toEqual([
        { id: 1n, name: "alpha", ts: "2021-01-01T00:00:00.000Z" },
        { id: 2n, name: "bravo", ts: "2021-06-15T12:30:00.000Z" },
        { id: 3n, name: "", ts: "1970-01-01T00:00:00.000Z" },
      ]);
      expect(r.pos).toBe(r.buf.length);
    } finally {
      await query(`DROP TABLE IF EXISTS ${t}`);
    }
  });
});
