import { readArray, readNullable } from "../readers/composite.js";
import { type Reader, advance } from "../readers/core.js";
import { readInt32, readUInt32 } from "../readers/integers.js";
import { readString } from "../readers/strings.js";
import { readUVarint } from "../readers/varint.js";

/**
 * Example: a profiles table — Array and Nullable wrappers.
 *
 * Columns (the trigger):
 *   id    UInt32
 *   tags  Array(String)
 *   score Nullable(Int32)
 *
 * `readArray(elem)` reads a LEB128 length then that many elements; `readNullable`
 * reads a 1-byte present/NULL flag then the value. Both are combinators: pass the
 * inner reader and they return a `Reader`. Empty array and NULL are the sharp
 * cases (a single byte each).
 */
export type ProfileRow = { id: number; tags: string[]; score: number | null };

export const readProfileRow: Reader<ProfileRow> = (s) => ({
  id: readUInt32(s),
  tags: readArray(readString)(s),
  score: readNullable(readInt32)(s),
});

/**
 * Optimized {@link readProfileRow}, monomorphized: `readArray(readString)` and
 * `readNullable(readInt32)` each allocate a fresh combinator closure on EVERY
 * row in the version above; here the array loop and the null-flag branch are
 * inlined, so no per-row closures are created and the element/inner reads are
 * straight-line. This is the kind of win the SKILL's "monomorphize" step targets;
 * see `profiles.bench.ts`.
 *
 * MEASURED (Node 24 / V8, `profiles.bench.ts`): ~1.3x faster — removing the two
 * per-row combinator closures (`readArray(readString)`, `readNullable(readInt32)`)
 * is the win.
 */
export const readProfileRowFast: Reader<ProfileRow> = (s) => {
  const { buf, view } = s;

  // id UInt32.
  const id = view.getUint32(advance(s, 4), true);

  // tags Array(String): count, then each a length-prefixed UTF-8 string.
  const n = readUVarint(s);
  const tags = new Array<string>(n);
  for (let i = 0; i < n; i++) {
    const len = readUVarint(s);
    const start = advance(s, len);
    tags[i] = buf.toString("utf8", start, start + len);
  }

  // score Nullable(Int32): null-flag byte, then if non-null a 4-byte int.
  const score =
    buf[advance(s, 1)]! !== 0 ? null : view.getInt32(advance(s, 4), true);

  return { id, tags, score };
};
