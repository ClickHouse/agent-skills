import { Cursor, advance } from "./core.js";

/**
 * Read a LEB128 unsigned varint (used for string/array lengths).
 *
 * Returns a JS `number`, so it is NOT bigint-friendly: only values up to
 * `Number.MAX_SAFE_INTEGER` (2^53 - 1) are representable exactly. A varint
 * larger than that throws rather than silently losing precision. RowBinary
 * lengths never approach this in practice.
 *
 * The loop is unrolled: each byte carries 7 bits, so its place value is the
 * constant 2^(7*k). The overwhelmingly common 1–2 byte case costs one or two
 * reads and a compare.
 *
 * Multipliers must stay as `*` (not `<<`): JS bitwise shift is 32-bit and would wrap past bit 31.
 *
 * SAFE TO TOGGLE — how many bytes to handle:
 * - If you know the maximum blob/array size, keep only the steps you need and
 *   delete the rest along with the overflow guard. E.g. lengths < 2^28 fit in
 *   4 bytes, so everything below the `* 268435456` step can go.
 * - Keep all eight steps (the default) when lengths are untrusted.
 * If you genuinely need lengths beyond 2^53, create a bigint version of this
 * function with a bigint accumulator instead of removing the guard.
 *
 * OPTIMIZATION HINT — for a known invariant, emit a dedicated named variant
 * rather than toggling here. E.g. a `readUVarint32` for lengths guaranteed to be
 * 32-bit would unroll only the first five bytes and throw past 2^32 - 1.
 */
export function readUVarint(state: Cursor): number {
  // Each byte reserves its space through `advance(1)` (the bounds check), but
  // the read itself stays inlined as `state.buf[...]` rather than calling
  // readUInt8 — this is the hottest loop in the reader.
  let byte = state.buf[advance(state, 1)]!;
  if (byte < 0x80) return byte; // 1 byte  -> 2^0
  let result = byte & 0x7f;

  byte = state.buf[advance(state, 1)]!;
  if (byte < 0x80) return result + byte * 128; // 2^7
  result += (byte & 0x7f) * 128;

  byte = state.buf[advance(state, 1)]!;
  if (byte < 0x80) return result + byte * 16384; // 2^14
  result += (byte & 0x7f) * 16384;

  byte = state.buf[advance(state, 1)]!;
  if (byte < 0x80) return result + byte * 2097152; // 2^21
  result += (byte & 0x7f) * 2097152;

  byte = state.buf[advance(state, 1)]!;
  if (byte < 0x80) return result + byte * 268435456; // 2^28
  result += (byte & 0x7f) * 268435456;

  byte = state.buf[advance(state, 1)]!;
  if (byte < 0x80) return result + byte * 34359738368; // 2^35
  result += (byte & 0x7f) * 34359738368;

  byte = state.buf[advance(state, 1)]!;
  if (byte < 0x80) return result + byte * 4398046511104; // 2^42
  result += (byte & 0x7f) * 4398046511104;

  // 8th byte: only its low 4 payload bits (bits 49..52) fit under 2^53. A larger
  // payload, or a continuation bit signalling a 9th byte, overflows MAX_SAFE_INTEGER.
  byte = state.buf[advance(state, 1)]!;
  if (byte > 0x0f) {
    throw new RangeError(
      "RowBinary: varint exceeds Number.MAX_SAFE_INTEGER (2^53 - 1)",
    );
  }
  return result + byte * 562949953421312; // 2^49
}
