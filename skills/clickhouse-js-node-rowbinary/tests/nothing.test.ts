import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readArray, readNullable } from "../src/readers/composite.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readNothing } from "../src/readers/nothing.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

/**
 * `Nothing` is the empty type: it has NO values and occupies ZERO bytes. It is
 * never a column on its own (you cannot materialize a value of it) — it only
 * shows up wrapped, as the inferred element of a literal with no type:
 *
 *   - `[]`   -> `Array(Nothing)`     -> always the empty array (varint len 0)
 *   - `NULL` -> `Nullable(Nothing)`  -> always NULL (lone flag byte 0x01)
 *
 * So there is no dedicated reader, and no "read a Nothing" ever happens: the
 * Array is empty (the element reader is not called) and the Nullable is NULL
 * (the inner reader is not called). The throwing readers below assert exactly
 * that — wrap with readArray / readNullable and the inner fn is unreachable.
 *
 * In practice, CAST a bare `[]`/`NULL` to a concrete type before SELECTing if
 * you want real elements; `Nothing` only appears for untyped literals.
 */
describe("Nothing (zero-width — only appears as Array(Nothing) / Nullable(Nothing))", () => {
  it("Array(Nothing) is the empty array; the element reader is never called", async () => {
    const r = await reader("[]");
    // readNothing throws if ever called; the empty array means it never is.
    expect(readArray(readNothing)(r)).toEqual([]);
    expect(r.pos).toBe(1); // just the varint length 0x00
  });

  it("Nullable(Nothing) is NULL; the inner reader is never called", async () => {
    const r = await reader("NULL");
    // readNothing throws if ever called; the NULL flag means it never is.
    expect(readNullable(readNothing)(r)).toBeNull();
    expect(r.pos).toBe(1); // lone NULL flag 0x01
  });

  describe("advance() edge cases", () => {
    it("Array(Nothing): throws NeedMoreData for every incomplete prefix", async () => {
      const full = await query("SELECT [] FORMAT RowBinary"); // single 0x00 count byte
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readArray(() => {
            throw new Error("element reader must not run");
          })(r);
        } catch (e) {
          thrown = e;
        }
        expect(thrown, `prefix length ${len}`).toBe(NeedMoreData);
      }
    });

    it("Nullable(Nothing): throws NeedMoreData for every incomplete prefix", async () => {
      const full = await query("SELECT NULL FORMAT RowBinary"); // single 0x01 flag byte
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readNullable(() => {
            throw new Error("inner reader must not run");
          })(r);
        } catch (e) {
          thrown = e;
        }
        expect(thrown, `prefix length ${len}`).toBe(NeedMoreData);
      }
    });
  });
});
