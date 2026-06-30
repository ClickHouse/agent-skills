import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readInt128 } from "../src/readers/integers.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

const MAX = 170141183460469231731687303715884105727n; // 2^127 - 1
const MIN = -170141183460469231731687303715884105728n; // -2^127

describe("readInt128", () => {
  it("decodes 0n", async () => {
    const r = await reader("toInt128(0)");
    expect(readInt128(r)).toBe(0n);
    expect(r.pos).toBe(16);
  });

  it("decodes -1n (all 0xff, sign spans both words)", async () => {
    expect(readInt128(await reader("toInt128('-1')"))).toBe(-1n);
  });

  it("decodes the max (2^127 - 1)", async () => {
    expect(readInt128(await reader(`toInt128('${MAX}')`))).toBe(MAX);
  });

  it("decodes the min (-2^127)", async () => {
    expect(readInt128(await reader(`toInt128('${MIN}')`))).toBe(MIN);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT toInt128(-5) FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readInt128(r);
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
