import { Sink, reserve } from "./core.js";

/** Write a `Float32`: 4 bytes, little-endian IEEE 754. Mirror of `readFloat32`. */
export function writeFloat32(sink: Sink, value: number): void {
  sink.view.setFloat32(reserve(sink, 4), value, true);
}

/** Write a `Float64`: 8 bytes, little-endian IEEE 754. Mirror of `readFloat64`. */
export function writeFloat64(sink: Sink, value: number): void {
  sink.view.setFloat64(reserve(sink, 8), value, true);
}

/**
 * Scratch view for narrowing a float32 to a `BFloat16`: BFloat16's 16 bits are
 * the top half of an IEEE 754 float32, so we stage the float32 and take its high
 * 16 bits back out.
 */
const bf16Scratch = new DataView(new ArrayBuffer(4));

/**
 * Write a `BFloat16`: 2 bytes, little-endian — the high 16 bits of `value`'s
 * float32 representation (same 8-bit exponent, 7-bit mantissa). Mirror of
 * `readBFloat16`: it widens a BFloat16 to a float32 by placing the bits in the
 * top half, so here we stage the float32 and take that top half back.
 *
 * NOTE: this TRUNCATES the float32 mantissa to BFloat16's 7 bits (no rounding),
 * matching the reader's exact inverse for values that originated as BFloat16. An
 * arbitrary float32 loses precision, exactly as ClickHouse's own BFloat16 cast.
 *
 * NOTE: `bf16Scratch` is module-level shared state written-then-read; safe
 * because the body is synchronous (do NOT introduce an `await`/`yield` between
 * the `setFloat32` and the `getUint16`).
 */
export function writeBFloat16(sink: Sink, value: number): void {
  bf16Scratch.setFloat32(0, value, true);
  // The float32's little-endian bytes are [lo16, hi16]; the high 16 bits at byte
  // offset 2 are the BFloat16 payload.
  const bits = bf16Scratch.getUint16(2, true);
  sink.view.setUint16(reserve(sink, 2), bits, true);
}
