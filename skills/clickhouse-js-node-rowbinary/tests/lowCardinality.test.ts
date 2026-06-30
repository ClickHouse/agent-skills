import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readNullable } from "../src/readers/composite.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readLowCardinality } from "../src/readers/lowCardinality.js";
import { readString } from "../src/readers/strings.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

/**
 * `LowCardinality(T)` is TRANSPARENT in RowBinary: it is encoded byte-for-byte
 * the same as `T`, with NO dictionary/index layer. (The dictionary encoding
 * exists only in the Native format — do not look for it here.) So there is no
 * dedicated reader: decode the inner `T` directly.
 */
describe("LowCardinality (transparent — decode as the inner type)", () => {
  it("LowCardinality(String) decodes exactly like String", async () => {
    const r = await reader("CAST('x' AS LowCardinality(String))");
    // readLowCardinality is the identity combinator: it just returns readString.
    expect(readLowCardinality(readString)(r)).toBe("x"); // identical bytes to String 'x': 01 78
    expect(r.pos).toBe(2);
  });

  it("LowCardinality(Nullable(String)) is just the inner Nullable(String)", async () => {
    const r = await reader("CAST(NULL AS LowCardinality(Nullable(String)))");
    expect(readNullable(readString)(r)).toBeNull();
    expect(r.pos).toBe(1); // lone null flag, no dictionary anything
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(
        "SELECT CAST('x' AS LowCardinality(String)) FORMAT RowBinary",
      );
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
