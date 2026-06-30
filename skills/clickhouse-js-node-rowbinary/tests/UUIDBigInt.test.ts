import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUUIDBigInt } from "../src/readers/uuid.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readUUIDBigInt", () => {
  it("decodes a UUID as its 128-bit value", async () => {
    const r = await reader("toUUID('61f0c404-5cb3-11e7-907b-a6006ad3dba0')");
    expect(readUUIDBigInt(r)).toBe(0x61f0c4045cb311e7907ba6006ad3dba0n);
    expect(r.pos).toBe(16);
  });

  it("decodes the nil UUID as 0n", async () => {
    expect(
      readUUIDBigInt(
        await reader("toUUID('00000000-0000-0000-0000-000000000000')"),
      ),
    ).toBe(0n);
  });

  it("decodes ...0001 as 1n", async () => {
    expect(
      readUUIDBigInt(
        await reader("toUUID('00000000-0000-0000-0000-000000000001')"),
      ),
    ).toBe(1n);
  });

  it("decodes the all-ones UUID as 2^128 - 1", async () => {
    expect(
      readUUIDBigInt(
        await reader("toUUID('ffffffff-ffff-ffff-ffff-ffffffffffff')"),
      ),
    ).toBe((1n << 128n) - 1n);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT toUUID('61f0c404-5cb3-11e7-907b-a6006ad3dba0') FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readUUIDBigInt(r);
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
