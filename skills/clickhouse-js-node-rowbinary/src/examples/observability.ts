import {
  readArray,
  readMap,
  readNullable,
  readTupleNamed,
  readVariant,
} from "../readers/composite.js";
import { type Reader, advance } from "../readers/core.js";
import { readDateTime64P3 } from "../readers/datetime.js";
import { readFloat64 } from "../readers/floats.js";
import { readInt8, readInt64, readUInt64 } from "../readers/integers.js";
import { readString } from "../readers/strings.js";
import { formatUUID, formatUUIDTable, readUUID } from "../readers/uuid.js";
import { readUVarint } from "../readers/varint.js";

/**
 * Example: an observability/events table — the gotcha-heavy one. It packs the
 * traps that trip a from-scratch decoder; the skill's job is getting them right.
 *
 * Columns (the trigger):
 *   id       UInt64
 *   ts       DateTime64(3, 'UTC')
 *   level    Enum8('debug'=1, 'info'=2, 'warn'=3, 'error'=4)
 *   trace_id UUID
 *   payload  Variant(String, Int64, Float64)
 *   tags     Map(LowCardinality(String), String)
 *   metrics  Array(Tuple(name LowCardinality(String), value Float64))
 *   attrs    Array(Nullable(Int64))
 *
 * Gotchas exercised, all in one row:
 * - `Variant(String, Int64, Float64)`: the discriminant indexes the alternatives
 *   SORTED BY TYPE NAME — ["Float64", "Int64", "String"] → 0=Float64, 1=Int64,
 *   2=String (NOT declaration order); `0xFF` = NULL. `readVariant` takes the
 *   readers in that sorted order.
 * - `DateTime64(3)`: 8-byte Int64 of millisecond ticks; P=3 is exactly a `Date`'s
 *   resolution, so `readDateTime64P3` returns a plain `Date` (here ISO-stringed).
 * - `LowCardinality(String)` (in the Map key and the Tuple field) is TRANSPARENT
 *   in RowBinary — decode as plain `String`, no dictionary layer.
 * - `UUID` is two little-endian `UInt64` halves, byte-reversed vs the text form.
 * - `Array(Nullable(Int64))`: per element a null flag then (if present) an Int64,
 *   kept as `bigint`.
 */
export type ObsRow = {
  id: bigint;
  ts: string;
  level: number;
  traceId: string;
  payload: number | bigint | string | null;
  tags: Map<string, string>;
  metrics: { name: string; value: number }[];
  attrs: (bigint | null)[];
};

/**
 * API-combinator reader. Note the `Variant` readers are in sorted-type-name
 * order (Float64, Int64, String), and `LowCardinality` columns just use the
 * inner `String` reader.
 */
export const readObsRow: Reader<ObsRow> = (s) => ({
  id: readUInt64(s),
  ts: readDateTime64P3(s).toISOString(),
  level: readInt8(s),
  traceId: formatUUID(readUUID(s)),
  payload: readVariant([readFloat64, readInt64, readString])(s),
  tags: readMap(readString, readString)(s),
  metrics: readArray(readTupleNamed({ name: readString, value: readFloat64 }))(
    s,
  ),
  attrs: readArray(readNullable(readInt64))(s),
});

/**
 * Optimized {@link readObsRow}, flattened per the SKILL.md guidance:
 * - `buf`/`view` hoisted to locals.
 * - the leading run of FIXED-WIDTH columns — `id` UInt64 (8) + `ts` DateTime64 (8)
 *   + `level` Enum8 (1) + `trace_id` UUID (16) = 33 bytes — is bounds-checked ONCE
 *   (`advance(s, 33)`) and read at constant offsets, instead of four `advance`s.
 * - the `Variant` is an inlined `switch` over the discriminant (sorted order).
 * - leaf reads inlined, `formatUUIDTable` for the UUID, pre-sized arrays.
 * The variable-width columns (`payload`/`tags`/`metrics`/`attrs`) each start a new
 * `advance` run because their size isn't known until decoded.
 */
export const readObsRowFast: Reader<ObsRow> = (s) => {
  const { buf, view } = s;

  // One bounds check for the 33-byte fixed-width head.
  const o = advance(s, 33);
  const id = view.getBigUint64(o, true);
  const ts = new Date(Number(view.getBigInt64(o + 8, true))).toISOString();
  const level = view.getInt8(o + 16);
  const traceId = formatUUIDTable(buf.subarray(o + 17, o + 33));

  // payload Variant(String, Int64, Float64): 1-byte discriminant (sorted names:
  // 0=Float64, 1=Int64, 2=String), 0xFF = NULL.
  let payload: number | bigint | string | null;
  const disc = buf[advance(s, 1)]!;
  if (disc === 0xff) {
    payload = null;
  } else if (disc === 0) {
    payload = view.getFloat64(advance(s, 8), true);
  } else if (disc === 1) {
    payload = view.getBigInt64(advance(s, 8), true);
  } else {
    const len = readUVarint(s);
    const st = advance(s, len);
    payload = buf.toString("utf8", st, st + len);
  }

  // tags Map(LowCardinality(String) -> String): count, then key/value strings.
  const tagN = readUVarint(s);
  const tags = new Map<string, string>();
  for (let i = 0; i < tagN; i++) {
    let len = readUVarint(s);
    let st = advance(s, len);
    const k = buf.toString("utf8", st, st + len);
    len = readUVarint(s);
    st = advance(s, len);
    tags.set(k, buf.toString("utf8", st, st + len));
  }

  // metrics Array(Tuple(name LowCardinality(String), value Float64)).
  const mN = readUVarint(s);
  const metrics = new Array<{ name: string; value: number }>(mN);
  for (let i = 0; i < mN; i++) {
    const len = readUVarint(s);
    const st = advance(s, len);
    const name = buf.toString("utf8", st, st + len);
    const value = view.getFloat64(advance(s, 8), true);
    metrics[i] = { name, value };
  }

  // attrs Array(Nullable(Int64)).
  const aN = readUVarint(s);
  const attrs = new Array<bigint | null>(aN);
  for (let i = 0; i < aN; i++) {
    attrs[i] =
      buf[advance(s, 1)]! !== 0 ? null : view.getBigInt64(advance(s, 8), true);
  }

  return { id, ts, level, traceId, payload, tags, metrics, attrs };
};
