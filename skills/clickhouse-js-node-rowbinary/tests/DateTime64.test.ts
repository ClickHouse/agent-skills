import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readDateTime64 } from "../src/readers/datetime.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readDateTime64", () => {
  it("decodes P=3 to [Date (whole seconds), nanoseconds]", async () => {
    const r = await reader("toDateTime64('2021-01-01 00:00:00.123', 3, 'UTC')");
    const [date, nanos] = readDateTime64(3)(r);
    expect(date.toISOString()).toBe("2021-01-01T00:00:00.000Z");
    expect(nanos).toBe(123_000_000);
    expect(r.pos).toBe(8);
  });

  it("keeps nanosecond precision (P=9) that a Date alone can't hold", async () => {
    const [date, nanos] = readDateTime64(9)(
      await reader("toDateTime64('2021-01-01 00:00:00.123456789', 9, 'UTC')"),
    );
    expect(date.toISOString()).toBe("2021-01-01T00:00:00.000Z");
    expect(nanos).toBe(123456789);
  });

  it("decodes P=0 with a zero fraction", async () => {
    const [date, nanos] = readDateTime64(0)(
      await reader("toDateTime64('2021-01-01 00:00:00', 0, 'UTC')"),
    );
    expect(date.toISOString()).toBe("2021-01-01T00:00:00.000Z");
    expect(nanos).toBe(0);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT toDateTime64('2021-01-01 00:00:00.123', 3, 'UTC') FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readDateTime64(3)(r);
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
