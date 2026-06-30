/**
 * The `RowBinaryWithNamesAndTypes` HEADER: the column names and their type
 * strings the server writes before the row data. Parsing the type strings into
 * readers lives in `compile.ts`; this module is just the wire read.
 */

import type { Cursor } from "./core.js";
import { readUVarint } from "./varint.js";
import { readString } from "./strings.js";

/** Column names and their type strings, in stream order. */
export interface RowBinaryHeader {
  names: string[];
  types: string[];
}

/**
 * Read the `RowBinaryWithNamesAndTypes` header off the cursor: a LEB128 column
 * count, then that many column-name `String`s, then that many type-string
 * `String`s. Leaves the cursor at the first row's bytes.
 */
export function readHeader(state: Cursor): RowBinaryHeader {
  const count = readUVarint(state);
  const names: string[] = new Array(count);
  for (let i = 0; i < count; i++) names[i] = readString(state);
  const types: string[] = new Array(count);
  for (let i = 0; i < count; i++) types[i] = readString(state);
  return { names, types };
}
