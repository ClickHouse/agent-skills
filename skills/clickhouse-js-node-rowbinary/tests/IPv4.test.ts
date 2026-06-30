import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { formatIPv4, readIPv4 } from "../src/readers/ip.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readIPv4", () => {
  it("decodes the raw UInt32 and formats a dotted quad", async () => {
    const r = await reader("toIPv4('1.2.3.4')");
    const value = readIPv4(r);
    expect(value).toBe(0x01020304);
    expect(r.pos).toBe(4);
    expect(formatIPv4(value)).toBe("1.2.3.4");
  });

  it("decodes 0.0.0.0", async () => {
    const value = readIPv4(await reader("toIPv4('0.0.0.0')"));
    expect(value).toBe(0);
    expect(formatIPv4(value)).toBe("0.0.0.0");
  });

  it("decodes 255.255.255.255", async () => {
    const value = readIPv4(await reader("toIPv4('255.255.255.255')"));
    expect(value).toBe(0xffffffff);
    expect(formatIPv4(value)).toBe("255.255.255.255");
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toIPv4('1.2.3.4') FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readIPv4(r);
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
