import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readInt256 } from "../src/readers/integers.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

// 2^255 - 1 and -2^255
const MAX =
  57896044618658097711785492504343953926634992332820282019728792003956564819967n;
const MIN =
  -57896044618658097711785492504343953926634992332820282019728792003956564819968n;

describe("readInt256", () => {
  it("decodes 0n", async () => {
    const r = await reader("toInt256(0)");
    expect(readInt256(r)).toBe(0n);
    expect(r.pos).toBe(32);
  });

  it("decodes -1n (all 0xff, sign spans all four words)", async () => {
    expect(readInt256(await reader("toInt256('-1')"))).toBe(-1n);
  });

  it("decodes the max (2^255 - 1)", async () => {
    expect(readInt256(await reader(`toInt256('${MAX}')`))).toBe(MAX);
  });

  it("decodes the min (-2^255)", async () => {
    expect(readInt256(await reader(`toInt256('${MIN}')`))).toBe(MIN);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toInt256(-5) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readInt256(r);
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
