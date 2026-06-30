import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { formatTime, readTime } from "../src/readers/time.js";

// Time / Time64 need enable_time_time64_type; pass it inline via SETTINGS.
async function reader(expr: string): Promise<Cursor> {
  return new Cursor(
    await query(
      `SELECT ${expr} SETTINGS enable_time_time64_type = 1 FORMAT RowBinary`,
    ),
  );
}

describe("readTime", () => {
  it("decodes seconds-of-day", async () => {
    const r = await reader("CAST('12:34:56' AS Time)");
    const secs = readTime(r);
    expect(secs).toBe(45296);
    expect(r.pos).toBe(4);
    expect(formatTime(secs)).toBe("12:34:56");
  });

  it("decodes a negative time", async () => {
    const secs = readTime(await reader("CAST('-01:00:00' AS Time)"));
    expect(secs).toBe(-3600);
    expect(formatTime(secs)).toBe("-01:00:00");
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST('12:34:56' AS Time) SETTINGS enable_time_time64_type = 1 FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readTime(r);
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
