import { Sink, reserve } from "./core.js";

/**
 * Write a LEB128 unsigned varint — the encode mirror of `readUVarint` (used for
 * string/array/map lengths).
 *
 * Takes a JS `number`, so it is NOT bigint-friendly: the value MUST be a
 * non-negative integer no larger than `Number.MAX_SAFE_INTEGER` (2^53 - 1). That
 * precondition is NOT checked here — at this level the data is expected to be
 * correct (a length the encoder itself produced), and an out-of-range value is a
 * programming error the server will reject. If you genuinely need lengths beyond
 * 2^53, write a bigint version with a bigint accumulator instead of widening this
 * one.
 *
 * UNROLLED, mirroring `readUVarint`: branch on magnitude so the exact byte count
 * is known up front for a single {@link reserve}, with no length-counting loop.
 * Each byte carries 7 payload bits low-first, with the continuation bit (`+ 0x80`)
 * set while more bits remain. `/` and `%` (never `>>>`/`&`): JS bitwise operators
 * are 32-bit and would corrupt values past bit 31. The overwhelmingly common
 * 1–2 byte case costs one or two compares.
 */
export function writeUVarint(sink: Sink, value: number): void {
  if (value < 0x80) {
    sink.buf[reserve(sink, 1)] = value;
    return;
  }
  if (value < 0x4000) {
    const o = reserve(sink, 2);
    sink.buf[o] = (value % 128) + 0x80;
    sink.buf[o + 1] = Math.floor(value / 128);
    return;
  }
  if (value < 0x200000) {
    const o = reserve(sink, 3);
    sink.buf[o] = (value % 128) + 0x80;
    sink.buf[o + 1] = (Math.floor(value / 128) % 128) + 0x80;
    sink.buf[o + 2] = Math.floor(value / 16384);
    return;
  }
  if (value < 0x10000000) {
    const o = reserve(sink, 4);
    sink.buf[o] = (value % 128) + 0x80;
    sink.buf[o + 1] = (Math.floor(value / 128) % 128) + 0x80;
    sink.buf[o + 2] = (Math.floor(value / 16384) % 128) + 0x80;
    sink.buf[o + 3] = Math.floor(value / 2097152);
    return;
  }
  // >= 2^28 — rare for RowBinary lengths. Fall back to a short loop writing into
  // a single span sized by a leading magnitude count (still one reserve()).
  let size = 5;
  for (
    let v = Math.floor(value / 268435456);
    v >= 0x80;
    v = Math.floor(v / 128)
  )
    size++;
  const o = reserve(sink, size);
  let v = value;
  for (let i = 0; i < size - 1; i++) {
    sink.buf[o + i] = (v % 128) + 0x80;
    v = Math.floor(v / 128);
  }
  sink.buf[o + size - 1] = v;
}
