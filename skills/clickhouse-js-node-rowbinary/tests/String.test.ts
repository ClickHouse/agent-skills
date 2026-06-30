import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readString } from "../src/readers/strings.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readString", () => {
  it("decodes a short ASCII string", async () => {
    const r = await reader("'hello'");
    expect(readString(r)).toBe("hello");
    // 1-byte varint length (5) + 5 payload bytes.
    expect(r.pos).toBe(6);
  });

  it("decodes the empty string", async () => {
    const r = await reader("''");
    expect(readString(r)).toBe("");
    expect(r.pos).toBe(1); // just the 0x00 length byte
  });

  it("decodes multi-byte UTF-8", async () => {
    expect(readString(await reader("'héllo · 日本'"))).toBe("héllo · 日本");
  });

  // A string longer than 127 bytes uses a 2-byte varint length prefix.
  it("decodes a string with a multi-byte length prefix", async () => {
    const r = await reader("repeat('x', 300)");
    expect(readString(r)).toBe("x".repeat(300));
    expect(r.pos).toBe(302); // 2-byte length + 300 payload
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query("SELECT 'hello' FORMAT RowBinary");
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readString(r);
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
