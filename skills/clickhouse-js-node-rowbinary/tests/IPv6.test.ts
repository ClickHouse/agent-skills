import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { formatIPv6, readIPv6 } from "../src/readers/ip.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readIPv6", () => {
  it("returns the raw 16 bytes and formats loopback ::1", async () => {
    const r = await reader("toIPv6('::1')");
    const bytes = readIPv6(r);
    expect(r.pos).toBe(16);
    expect(bytes).toEqual(
      Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
    );
    expect(formatIPv6(bytes)).toBe("::1");
  });

  it("formats the all-zero address ::", async () => {
    expect(formatIPv6(readIPv6(await reader("toIPv6('::')")))).toBe("::");
  });

  it("collapses the longest zero run", async () => {
    expect(formatIPv6(readIPv6(await reader("toIPv6('2001:db8::1')")))).toBe(
      "2001:db8::1",
    );
  });

  // Two zero runs: the longer one (positions 4-6) is collapsed, not the first.
  it("collapses the longest run, not the leftmost", async () => {
    expect(
      formatIPv6(readIPv6(await reader("toIPv6('1:0:0:2:0:0:0:3')"))),
    ).toBe("1:0:0:2::3");
  });

  it("leaves a fully-populated address uncompressed", async () => {
    expect(
      formatIPv6(readIPv6(await reader("toIPv6('2001:db8:1:2:3:4:5:6')"))),
    ).toBe("2001:db8:1:2:3:4:5:6");
  });

  it("renders IPv4-mapped addresses as ::ffff:a.b.c.d", async () => {
    expect(formatIPv6(readIPv6(await reader("toIPv6('::ffff:1.2.3.4')")))).toBe(
      "::ffff:1.2.3.4",
    );
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toIPv6('2001:db8::1') FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readIPv6(r);
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
