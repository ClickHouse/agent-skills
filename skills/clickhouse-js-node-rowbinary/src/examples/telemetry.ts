import {
  readArray,
  readMap,
  readNullable,
  readTupleNamed,
} from "../readers/composite.js";
import { type Reader, advance } from "../readers/core.js";
import { readFloat64 } from "../readers/floats.js";
import { readUInt16, readUInt32 } from "../readers/integers.js";
import { readString } from "../readers/strings.js";
import { readUVarint } from "../readers/varint.js";

/**
 * Example: a telemetry table — composite readers that nest.
 *
 * Columns (the trigger):
 *   host   String
 *   tags   Map(String, String)
 *   cpu    Array(Float64)
 *   region Nullable(String)
 *   window Tuple(start UInt32, count UInt16)
 *
 * The combinators compose exactly the way the column type nests:
 * `readMap(k, v)`, `readArray(elem)`, `readNullable(inner)`, and
 * `readTupleNamed({...})` each take sub-readers and return a `Reader`. This is the
 * generic (closure-per-element) API; a generated parser would monomorphize these
 * into inlined per-type loops, but the result shape is exactly this.
 */
export type TelemetryRow = {
  host: string;
  tags: Map<string, string>;
  cpu: number[];
  region: string | null;
  window: { start: number; count: number };
};

export const readTelemetryRow: Reader<TelemetryRow> = (s) => ({
  host: readString(s),
  tags: readMap(readString, readString)(s),
  cpu: readArray(readFloat64)(s),
  region: readNullable(readString)(s),
  window: readTupleNamed({ start: readUInt32, count: readUInt16 })(s),
});

/**
 * Optimized {@link readTelemetryRow}, fully monomorphized: the API version above
 * builds FOUR combinator closures per row (`readMap(...)`, `readArray(...)`,
 * `readNullable(...)`, `readTupleNamed(...)`) and, for the named tuple, iterates
 * a keys array building an object field by field. Here every loop and branch is
 * inlined and the `window` object is a flat literal — no per-row closures, no
 * key iteration. The most composite-heavy example.
 *
 * MEASURED (Node 24 / V8, `telemetry.bench.ts`): ~1.4x faster — four per-row
 * combinator closures and the named-tuple key iteration removed.
 */
export const readTelemetryRowFast: Reader<TelemetryRow> = (s) => {
  const { buf, view } = s;

  // host String: length prefix, then the bytes.
  let len = readUVarint(s);
  let start = advance(s, len);
  const host = buf.toString("utf8", start, start + len);

  // tags Map(String, String): count, then key/value strings.
  const mapN = readUVarint(s);
  const tags = new Map<string, string>();
  for (let i = 0; i < mapN; i++) {
    len = readUVarint(s);
    start = advance(s, len);
    const k = buf.toString("utf8", start, start + len);
    len = readUVarint(s);
    start = advance(s, len);
    tags.set(k, buf.toString("utf8", start, start + len));
  }

  // cpu Array(Float64): count, then 8 bytes each.
  const cpuN = readUVarint(s);
  const cpu = new Array<number>(cpuN);
  for (let i = 0; i < cpuN; i++) {
    cpu[i] = view.getFloat64(advance(s, 8), true);
  }

  // region Nullable(String): null-flag byte, then if non-null a string.
  let region: string | null;
  if (buf[advance(s, 1)]! !== 0) {
    region = null;
  } else {
    len = readUVarint(s);
    start = advance(s, len);
    region = buf.toString("utf8", start, start + len);
  }

  // window Tuple(start UInt32, count UInt16): two adjacent fixed-width fields,
  // bounds-checked once (6 bytes), then read at literal offsets.
  const w = advance(s, 6);
  const window = {
    start: view.getUint32(w, true),
    count: view.getUint16(w + 4, true),
  };

  return { host, tags, cpu, region, window };
};
