import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import {
  formatUUID,
  readUUID,
  readUUIDBigInt,
  readUUIDHiLo,
} from "../src/readers/uuid.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readUUIDHiLo", () => {
  it("returns the two little-endian UInt64 halves [hi, lo]", async () => {
    const r = await reader("toUUID('61f0c404-5cb3-11e7-907b-a6006ad3dba0')");
    expect(readUUIDHiLo(r)).toEqual([0x61f0c4045cb311e7n, 0x907ba6006ad3dba0n]);
    expect(r.pos).toBe(16);
  });

  it("composes back to the same value as readUUIDBigInt / formatUUID", async () => {
    const expr = "toUUID('61f0c404-5cb3-11e7-907b-a6006ad3dba0')";
    const [hi, lo] = readUUIDHiLo(await reader(expr));
    // hi << 64 | lo is exactly what readUUIDBigInt returns.
    expect((hi << 64n) | lo).toBe(readUUIDBigInt(await reader(expr)));
    // The 32 hex digits are hi then lo, zero-padded — matching formatUUID.
    const hex =
      hi.toString(16).padStart(16, "0") + lo.toString(16).padStart(16, "0");
    expect(hex).toBe(
      formatUUID(readUUID(await reader(expr))).replaceAll("-", ""),
    );
  });

  it("decodes the nil UUID as [0, 0]", async () => {
    const r = await reader("toUUID('00000000-0000-0000-0000-000000000000')");
    expect(readUUIDHiLo(r)).toEqual([0n, 0n]);
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
          readUUIDHiLo(r);
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
