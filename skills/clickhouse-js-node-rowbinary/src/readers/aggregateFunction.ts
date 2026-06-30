import { type Reader } from "./core.js";

/**
 * `AggregateFunction(func, T…)` holds an OPAQUE serialized aggregation STATE
 * (what `-State` combinators produce). In RowBinary this state is written RAW,
 * with **NO length prefix** and a layout entirely specific to `func` (and to the
 * ClickHouse version): `sumState(UInt64)` is 8 bytes, `uniqState(...)` is a
 * variable-length hash-set blob, etc.
 *
 * So it cannot be decoded generically (there is no schema in the bytes) and
 * cannot even be SKIPPED generically (there is no length to skip past) — without
 * knowing `func`'s exact byte layout you cannot find where it ends, and every
 * later column in the row misaligns. There is therefore NO generic reader.
 *
 * Fix it server-side (RECOMMENDED): finalize with the `-Merge` combinator or
 * `finalizeAggregation()` in SQL so the column becomes a normal value
 * (`sum` -> `UInt64`, `uniq` -> `UInt64`, `avg` -> `Float64`, …) and use the
 * matching reader. Never ship raw `-State` columns to the client unless you
 * intend to merge them later.
 *
 * ESCAPE HATCH: a few functions' state IS just a value of a known type (e.g.
 * `sumState(UInt64)` is literally that `UInt64`), so you may decode it as that
 * type — fragile and version-specific; only when you truly know the layout. See
 * `tests/aggregateFunction.test.ts`.
 *
 * This reader throws to stop a generic parser from silently misaligning the row.
 */
export const readAggregateFunction: Reader<never> = () => {
  throw new Error(
    "RowBinary: AggregateFunction is opaque, unframed aggregation state with no " +
      "length prefix — not generically decodable or skippable. Finalize server-side " +
      "(-Merge / finalizeAggregation()) and decode the concrete result type instead.",
  );
};
