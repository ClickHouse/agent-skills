import { Cursor, advance } from "./core.js";

/**
 * Scratch view for widening a `BFloat16`: its 16 bits are the top half of an
 * IEEE 754 float32, so we stage them into a 4-byte buffer and read a float32.
 */
const bf16Scratch = new DataView(new ArrayBuffer(4));

/** Read a `Float32`: 4 bytes, little-endian IEEE 754 single precision. */
export function readFloat32(state: Cursor): number {
  return state.view.getFloat32(advance(state, 4), true);
}

/** Read a `Float64`: 8 bytes, little-endian IEEE 754 double precision. */
export function readFloat64(state: Cursor): number {
  return state.view.getFloat64(advance(state, 8), true);
}

/**
 * Read a `BFloat16`: 2 bytes, little-endian. BFloat16 is the high 16 bits of a
 * float32 (same 8-bit exponent, 7-bit mantissa), so placing the bits in the top
 * half of a 32-bit float and reading it back is exact.
 *
 * NOTE: `bf16Scratch` is module-level shared state written-then-read in this
 * function. That is safe because the read is synchronous; do NOT introduce an
 * `await`/`yield` between the `setUint32` and the `getFloat32`.
 */
export function readBFloat16(state: Cursor): number {
  const bits = state.view.getUint16(advance(state, 2), true);
  bf16Scratch.setUint32(0, bits * 0x10000, true);
  return bf16Scratch.getFloat32(0, true);
}
