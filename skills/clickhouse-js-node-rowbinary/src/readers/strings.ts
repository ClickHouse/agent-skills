import { type Reader, Cursor, advance } from "./core.js";
import { readUVarint } from "./varint.js";

/**
 * Read a `String`: a varint byte-length prefix followed by that many bytes,
 * decoded as UTF-8.
 *
 * NOTE: ClickHouse `String` is arbitrary bytes, not guaranteed UTF-8. For binary
 * columns, read `state.buf.subarray(start, start + len)` and skip the decode to
 * keep the raw bytes.
 */
export function readString(state: Cursor): string {
  const len = readUVarint(state);
  const start = advance(state, len);
  return state.buf.toString("utf8", start, start + len);
}

/**
 * Read a `FixedString(N)`: exactly `size` raw bytes, decoded as UTF-8. Curried:
 * `readFixedString(N)` returns the reader.
 *
 * The value is right-padded with NUL bytes to `size`; those trailing `\x00` are
 * part of the stored value and are preserved here. Trim them
 * (`.replace(/\x00+$/, "")`) only if your column holds NUL-terminated text.
 *
 * ClickHouse server returns `FixedString`s in JSON with the trailing NULs,
 * therefore this reader preserves them as well.
 */
export function readFixedString(size: number): Reader<string> {
  return (state) => {
    const start = advance(state, size);
    return state.buf.toString("utf8", start, start + size);
  };
}

/**
 * Read a `FixedString(N)` as raw bytes (no UTF-8 decode) — for binary columns.
 * Curried: `readFixedStringBytes(N)` returns the reader. Returns a zero-copy
 * view: no allocation, but the slice shares memory with the response, so
 * retaining any one slice pins the entire chunk buffer in memory.
 *
 * SAFE TO TOGGLE — if the bytes outlive the row/response, return an independent
 * copy instead so the chunk can be freed:
 *
 *   // return Buffer.from(state.buf.subarray(start, start + size));
 *
 * Make an educated tradeoff: view (default) when consumed immediately, a copy
 * when retained.
 */
export function readFixedStringBytes(size: number): Reader<Buffer> {
  return (state) => {
    const start = advance(state, size);
    return state.buf.subarray(start, start + size);
  };
}
