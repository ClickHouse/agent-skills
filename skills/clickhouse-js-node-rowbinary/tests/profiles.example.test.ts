import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import { type ProfileRow, readProfileRow } from "../src/examples/profiles.js";
import { readRows } from "../src/readers/rows.js";

/**
 * Runs the `profiles` example end to end (Array + Nullable). Populated via
 * `JSONEachRow`; the empty array and the NULL score are the single-byte edge
 * cases the reader has to get right.
 */
describe("example: profiles (Array + Nullable via JSONEachRow)", () => {
  it("creates, populates, and reads back through readProfileRow", async () => {
    const t = "rb_example_profiles";
    await query(`DROP TABLE IF EXISTS ${t}`);
    await query(
      `CREATE TABLE ${t} (id UInt32, tags Array(String), score Nullable(Int32)) ENGINE = Memory`,
    );
    try {
      const rows = [
        { id: 1, tags: ["a", "b"], score: 10 },
        { id: 2, tags: [], score: null },
        { id: 3, tags: ["solo"], score: -5 },
      ];
      await query(
        `INSERT INTO ${t} FORMAT JSONEachRow\n` +
          rows.map((r) => JSON.stringify(r)).join("\n"),
      );

      const r = new Cursor(
        await query(
          `SELECT id, tags, score FROM ${t} ORDER BY id FORMAT RowBinary`,
        ),
      );
      const out: ProfileRow[] = readRows(readProfileRow)(r);
      expect(out).toEqual([
        { id: 1, tags: ["a", "b"], score: 10 },
        { id: 2, tags: [], score: null },
        { id: 3, tags: ["solo"], score: -5 },
      ]);
      expect(r.pos).toBe(r.buf.length);
    } finally {
      await query(`DROP TABLE IF EXISTS ${t}`);
    }
  });
});
