import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readQBit } from "../src/readers/composite.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import {
  readBFloat16,
  readFloat32,
  readFloat64,
} from "../src/readers/floats.js";
import { readUInt8 } from "../src/readers/integers.js";

// QBit is experimental; the type needs allow_experimental_qbit_type.
async function reader(expr: string): Promise<Cursor> {
  return new Cursor(
    await query(
      `SELECT ${expr} SETTINGS allow_experimental_qbit_type = 1 FORMAT RowBinary`,
    ),
  );
}

/**
 * `QBit(element_type, dimension)` is a vector-search type whose storage keeps
 * the vector bit-transposed for quantized distance math. But that layout is a
 * STORAGE / Native-format concern: in RowBinary a `QBit` is materialized as the
 * plain vector — encoded byte-for-byte like `Array(element_type)` (a LEB128
 * length, then `dimension` element values). So `readQBit` is transparent: it
 * just reads it as an array of the element type.
 *
 * The element type is one of the quantizable floats: `BFloat16`, `Float32`,
 * `Float64` — read each with the matching float reader.
 */
describe("QBit (transparent in RowBinary — decode as Array(element_type))", () => {
  it("QBit(Float32, N) decodes exactly like Array(Float32)", async () => {
    const r = await reader("[1.0, 2.0, 3.0, 4.0]::QBit(Float32, 4)");
    expect(readQBit(readFloat32)(r)).toEqual([1, 2, 3, 4]);
    expect(r.pos).toBe(1 + 4 * 4); // length byte + 4 Float32s
  });

  it("QBit(Float64, N) decodes exactly like Array(Float64)", async () => {
    const r = await reader("[1.5, 2.5]::QBit(Float64, 2)");
    expect(readQBit(readFloat64)(r)).toEqual([1.5, 2.5]);
  });

  it("QBit(BFloat16, N) decodes exactly like Array(BFloat16)", async () => {
    const r = await reader("[1.0, 2.0, 3.0, 4.0]::QBit(BFloat16, 4)");
    // BFloat16 of small integers is exact (they fit the float32 high half).
    expect(readQBit(readBFloat16)(r)).toEqual([1, 2, 3, 4]);
  });

  it("is length-prefixed like Array — the next column starts right after", async () => {
    const r = await reader(
      "[1.0, 2.0]::QBit(Float32, 2) AS q, toUInt8(255) AS m",
    );
    expect(readQBit(readFloat32)(r)).toEqual([1, 2]);
    expect(r.pos).toBe(1 + 2 * 4); // exact: no quantization padding
    expect(readUInt8(r)).toBe(255); // proves the framing matched
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT [1.0, 2.0]::QBit(Float32, 2) SETTINGS allow_experimental_qbit_type = 1 FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readQBit(readFloat32)(r);
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
