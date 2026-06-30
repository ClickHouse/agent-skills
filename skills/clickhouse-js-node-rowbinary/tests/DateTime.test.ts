import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readDateTime } from "../src/readers/datetime.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readDateTime", () => {
  it("decodes Unix seconds to a JS Date", async () => {
    const r = await reader("toDateTime('2021-01-01 00:00:00', 'UTC')");
    const d = readDateTime(r);
    expect(d.toISOString()).toBe("2021-01-01T00:00:00.000Z");
    expect(d.getTime()).toBe(1609459200000);
    expect(r.pos).toBe(4);
  });

  it("decodes the epoch", async () => {
    const d = readDateTime(
      await reader("toDateTime('1970-01-01 00:00:00', 'UTC')"),
    );
    expect(d.getTime()).toBe(0);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT toDateTime('2021-01-01 00:00:00', 'UTC') FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readDateTime(r);
        } catch (e) {
          thrown = e;
        }
        expect(thrown, `prefix length ${len} of ${full.length}`).toBe(
          NeedMoreData,
        );
      }
    });
  });
});
