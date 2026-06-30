import { type Reader, advance } from "../readers/core.js";
import { readDateTime } from "../readers/datetime.js";
import { readString } from "../readers/strings.js";
import { readUVarint } from "../readers/varint.js";

/**
 * Example: an application log table — the STRING-HEAVY case where the skill
 * steers you AWAY from RowBinary and toward a `JSON*` format. The honest
 * counter-case to the IoT and ledger studies; see `logs.bench.ts`.
 *
 * Columns (the trigger — generate this reader when a result has these types):
 *   ts        DateTime
 *   level     LowCardinality(String)
 *   service   LowCardinality(String)
 *   message   String
 *   trace_id  String
 *
 * Four of the five columns are text consumed wholesale, and `LowCardinality(T)`
 * is transparent in RowBinary (decodes as the inner `String`, no dictionary on
 * the wire). A RowBinary string read is a varint length + `buf.toString("utf8",
 * …)` per field in JS; V8's native `JSON.parse` builds the same JS strings in
 * optimized C++ and tends to WIN here. This reader exists so the comparison is
 * apples-to-apples — not because RowBinary is the right call for this shape.
 */
export type LogRow = {
  ts: Date;
  level: string;
  service: string;
  message: string;
  trace_id: string;
};

/**
 * API-combinator reader: one leaf reader per column, the clear default. There is
 * little to monomorphize on a mostly-string row — the only fixed-width field is
 * `ts` — so `readLogRowFast` below is barely different and barely faster; the
 * real lesson (see `logs.bench.ts`) is that JSON beats both.
 */
export const readLogRow: Reader<LogRow> = (s) => ({
  ts: readDateTime(s),
  level: readString(s), // LowCardinality(String) — transparent, decode as String
  service: readString(s), // LowCardinality(String) — transparent, decode as String
  message: readString(s),
  trace_id: readString(s),
});

/**
 * Optimized {@link readLogRow}: the four string reads inlined (varint length +
 * `buf.toString` in place) and the `DateTime` read written out. Note how little
 * monomorphization can do when the row is dominated by variable-length strings —
 * there are no adjacent fixed-width columns to coalesce, so this stays close to
 * the API version. Included to make `logs.bench.ts` a fair fight; the takeaway
 * is to pick `JSONEachRow` for this shape, not to tune this reader.
 */
export const readLogRowFast: Reader<LogRow> = (s) => {
  const { buf } = s;
  // DateTime: 4-byte LE Unix seconds.
  const ts = new Date(s.view.getUint32(advance(s, 4), true) * 1000);
  // Four UTF-8 Strings (the two LowCardinality columns are plain String on the wire).
  let len = readUVarint(s);
  let o = advance(s, len);
  const level = buf.toString("utf8", o, o + len);
  len = readUVarint(s);
  o = advance(s, len);
  const service = buf.toString("utf8", o, o + len);
  len = readUVarint(s);
  o = advance(s, len);
  const message = buf.toString("utf8", o, o + len);
  len = readUVarint(s);
  o = advance(s, len);
  const trace_id = buf.toString("utf8", o, o + len);
  return { ts, level, service, message, trace_id };
};
