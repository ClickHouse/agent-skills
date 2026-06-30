import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { formatUUID, formatUUIDTable, readUUID } from "../src/readers/uuid.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

describe("readUUID", () => {
  it("returns the raw 16 bytes and formats them (per-half byte order)", async () => {
    const r = await reader("toUUID('61f0c404-5cb3-11e7-907b-a6006ad3dba0')");
    const bytes = readUUID(r);
    expect(r.pos).toBe(16);
    // Wire layout: each LE UInt64 half is byte-reversed vs the text form.
    expect(bytes).toEqual(
      Buffer.from([
        0xe7, 0x11, 0xb3, 0x5c, 0x04, 0xc4, 0xf0, 0x61, 0xa0, 0xdb, 0xd3, 0x6a,
        0x00, 0xa6, 0x7b, 0x90,
      ]),
    );
    expect(formatUUID(bytes)).toBe("61f0c404-5cb3-11e7-907b-a6006ad3dba0");
  });

  it("formats the nil UUID", async () => {
    expect(
      formatUUID(
        readUUID(
          await reader("toUUID('00000000-0000-0000-0000-000000000000')"),
        ),
      ),
    ).toBe("00000000-0000-0000-0000-000000000000");
  });

  // Smallest non-zero value: exercises zero-padding of leading hex digits.
  it("zero-pads leading digits", async () => {
    expect(
      formatUUID(
        readUUID(
          await reader("toUUID('00000000-0000-0000-0000-000000000001')"),
        ),
      ),
    ).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("formats the all-ones UUID", async () => {
    expect(
      formatUUID(
        readUUID(
          await reader("toUUID('ffffffff-ffff-ffff-ffff-ffffffffffff')"),
        ),
      ),
    ).toBe("ffffffff-ffff-ffff-ffff-ffffffffffff");
  });

  // The fast formatter: formatUUIDTable must match formatUUID exactly on the
  // same raw bytes (lookup table instead of BigInt).
  describe("formatUUIDTable (fast lookup-table formatter)", () => {
    it("matches formatUUID for a typical value", async () => {
      const b = readUUID(
        await reader("toUUID('61f0c404-5cb3-11e7-907b-a6006ad3dba0')"),
      );
      expect(formatUUIDTable(b)).toBe("61f0c404-5cb3-11e7-907b-a6006ad3dba0");
      expect(formatUUIDTable(b)).toBe(formatUUID(b));
    });

    it("zero-pads leading digits and formats the nil UUID", async () => {
      expect(
        formatUUIDTable(
          readUUID(
            await reader("toUUID('00000000-0000-0000-0000-000000000001')"),
          ),
        ),
      ).toBe("00000000-0000-0000-0000-000000000001");
      expect(
        formatUUIDTable(
          readUUID(
            await reader("toUUID('00000000-0000-0000-0000-000000000000')"),
          ),
        ),
      ).toBe("00000000-0000-0000-0000-000000000000");
    });

    it("reuses the shared output buffer across calls without corruption", async () => {
      const a = formatUUIDTable(
        readUUID(
          await reader("toUUID('61f0c404-5cb3-11e7-907b-a6006ad3dba0')"),
        ),
      );
      const b = formatUUIDTable(
        readUUID(
          await reader("toUUID('ffffffff-ffff-ffff-ffff-ffffffffffff')"),
        ),
      );
      expect(a).toBe("61f0c404-5cb3-11e7-907b-a6006ad3dba0"); // earlier result is a copied string, not clobbered
      expect(b).toBe("ffffffff-ffff-ffff-ffff-ffffffffffff");
    });
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
          readUUID(r);
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
