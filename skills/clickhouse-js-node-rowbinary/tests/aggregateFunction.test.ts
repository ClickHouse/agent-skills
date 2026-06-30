import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { readAggregateFunction } from "../src/readers/aggregateFunction.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readUInt64, readUInt8 } from "../src/readers/integers.js";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

/**
 * `AggregateFunction(func, T...)` holds an OPAQUE serialized aggregation STATE
 * (what `-State` combinators produce). In RowBinary this state is written RAW,
 * with **NO length prefix** and a layout that is entirely specific to `func`
 * (and to the ClickHouse version). For example `sumState(UInt64)` is 8 bytes
 * (the running sum), while `uniqState(...)` is a variable-length hash-set blob.
 *
 * Consequences for a generic parser:
 *   - It cannot be decoded generically — there is no schema in the bytes.
 *   - It cannot even be SKIPPED generically — there is no length to skip past;
 *     you must know `func`'s exact byte layout to find where it ends, otherwise
 *     every column after it in the row is misaligned.
 *
 * So there is NO generic reader. Two real options:
 *
 *  1. RECOMMENDED — finalize server-side, decode the concrete result type.
 *     Apply the `-Merge` combinator or `finalizeAggregation()` in SQL so the
 *     column becomes a normal value (`sum` -> `UInt64`, `uniq` -> `UInt64`,
 *     `avg` -> `Float64`, ...) and use the matching reader. Never ship raw
 *     `-State` columns to the client unless you intend to merge them later.
 *
 *  2. ESCAPE HATCH — known fixed layout only. A few functions' state IS just a
 *     value of a known type (e.g. `sumState(UInt64)` is literally that UInt64),
 *     so you may decode it as that type. This is fragile and version-specific;
 *     only do it when you truly know the internal layout. See below.
 */
describe("AggregateFunction (opaque state — finalize server-side)", () => {
  it("RECOMMENDED: finalize with -Merge / finalizeAggregation, then decode normally", async () => {
    // uniqMerge collapses the uniq state to a concrete UInt64 cardinality.
    const merged = await reader(
      "uniqMerge(s) FROM (SELECT uniqState(number) AS s FROM numbers(5))",
    );
    expect(readUInt64(merged)).toBe(5n);

    // finalizeAggregation does the same inline without a GROUP BY context.
    const finalized = await reader(
      "finalizeAggregation(sumState(toUInt64(42)))",
    );
    expect(readUInt64(finalized)).toBe(42n); // type is now plain UInt64
  });

  it("ESCAPE HATCH: sumState(UInt64) state happens to be the raw UInt64 (fragile, layout-specific)", async () => {
    // sumState's state is just the running sum, with NO length prefix: the next
    // column begins immediately after the 8 sum bytes. We decode it as UInt64
    // only because we know this exact layout — do not generalize this.
    const r = await reader("sumState(toUInt64(42)) AS a, toUInt8(255) AS b");
    expect(readUInt64(r)).toBe(42n); // the state, read as its known UInt64 shape
    expect(r.pos).toBe(8); // no framing — column b starts right here
    expect(readUInt8(r)).toBe(255); // proves the 8-byte state was exact
  });

  it("readAggregateFunction is a guard: it always throws (never decode opaque state)", () => {
    const r = new Cursor(Buffer.alloc(0));
    expect(() => readAggregateFunction(r)).toThrow(/opaque/i);
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      // sumState(UInt64) is a raw 8-byte sum with no length prefix.
      const full = await query(
        "SELECT sumState(toUInt64(42)) FORMAT RowBinary",
      );
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readUInt64(r);
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
