import { Cursor } from "./core.js";
import { readUVarint } from "./varint.js";
import { readString } from "./strings.js";
import { readDynamic } from "./dynamic.js";

/**
 * Read a `JSON` value. ClickHouse's `JSON` is NOT JSON text and NOT BSON — it is
 * a list of (path, value) pairs built on the same machinery as `Dynamic`:
 *
 *   <varuint pathCount>  then pathCount x ( <String path> <Dynamic value> )
 *
 * Nested objects are FLATTENED to dotted paths (`{a:{b:2}}` -> path `"a.b"`), and
 * each leaf value is a self-describing `Dynamic`, so this just loops
 * {@link readString} + {@link readDynamic}. Returns a `Map` keyed by the flat
 * dotted path. Path order on the wire is not significant.
 *
 * GOTCHA: a null-valued path is NOT stored at all — `{"a":null}` serializes as
 * zero paths, identical to `{}`. JSON arrays come back as `Array(Nullable(T))`.
 *
 * LIMITATION — typed paths only. This reads a plain `JSON` column, where every
 * path is dynamic (tagged). A `JSON(a T, ...)` with DECLARED typed paths
 * serializes those paths' values WITHOUT a type tag, so they cannot be decoded
 * without the schema; read each typed path with its known `T` reader instead.
 */
export function readJSON(state: Cursor): Map<string, unknown> {
  const n = readUVarint(state);
  const out = new Map<string, unknown>();
  for (let i = 0; i < n; i++) {
    const path = readString(state);
    out.set(path, readDynamic(state));
  }
  return out;
}
