import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { formatTime64, readTime64 } from "../src/readers/time.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(
    await query(
      `SELECT ${expr} SETTINGS enable_time_time64_type = 1 FORMAT RowBinary`,
    ),
  );
}

describe("readTime64", () => {
  it("decodes millisecond ticks (P=3)", async () => {
    const r = await reader("toTime64('12:34:56.123', 3)");
    const t = readTime64(3)(r);
    expect(t).toEqual([45296123n, 3]);
    expect(r.pos).toBe(8);
    expect(formatTime64(t)).toBe("12:34:56.123");
  });

  it("decodes a negative time with fractional seconds", async () => {
    const t = readTime64(3)(await reader("toTime64('-01:00:00.500', 3)"));
    expect(t).toEqual([-3600500n, 3]);
    expect(formatTime64(t)).toBe("-01:00:00.500");
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT toTime64('12:34:56.123', 3) SETTINGS enable_time_time64_type = 1 FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readTime64(3)(r);
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
