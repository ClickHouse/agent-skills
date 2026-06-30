import { type Reader, advance } from "../readers/core.js";
import { readDateTime } from "../readers/datetime.js";
import { readUInt64 } from "../readers/integers.js";
import { readString } from "../readers/strings.js";
import { readUVarint } from "../readers/varint.js";

/**
 * Example: a plain events table — the scalar baseline.
 *
 * Columns (the trigger — generate this reader when a result has these types):
 *   id   UInt64
 *   name String
 *   ts   DateTime('UTC')
 *
 * A wide integer (returned as `bigint`, never a lossy `number`), an arbitrary
 * `String`, and a `DateTime` rendered to an ISO-8601 string here for a stable,
 * timezone-independent result (the raw reader returns a JS `Date`). Drive it over
 * a whole result with `readRows(readEventRow)`.
 */
export type EventRow = { id: bigint; name: string; ts: string };

export const readEventRow: Reader<EventRow> = (s) => ({
  id: readUInt64(s),
  name: readString(s),
  ts: readDateTime(s).toISOString(),
});

/**
 * Optimized {@link readEventRow}: the same three reads inlined into one function
 * body — no per-field reader calls, the `String` length + slice and the
 * `DateTime` math written out in place. All scalars, so there is little for the
 * monomorphization to remove (the JIT already inlines the leaf readers); see
 * `events.bench.ts`. Still goes through `advance()`, so it stays streaming-safe.
 *
 * MEASURED (Node 24 / V8, `events.bench.ts`): ~1.05x — essentially ON PAR, within
 * run-to-run noise. A purely scalar row has no per-row closures to remove and V8
 * already inlines the leaf readers, so there is no real win here: prefer the
 * clearer API `readEventRow` unless your own profiling says otherwise. (Contrast
 * the composite examples, where monomorphization removes per-row closures and
 * wins 1.3x–2.7x.)
 */
export const readEventRowFast: Reader<EventRow> = (s) => {
  const id = s.view.getBigUint64(advance(s, 8), true);
  const len = readUVarint(s);
  const start = advance(s, len);
  const name = s.buf.toString("utf8", start, start + len);
  const ts = new Date(
    s.view.getUint32(advance(s, 4), true) * 1000,
  ).toISOString();
  return { id, name, ts };
};
