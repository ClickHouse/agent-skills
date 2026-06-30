import { Sink, reserve } from "./core.js";

// --- Writers: the encode mirror of the readers in `integers.ts`. Each writeX is
// the inverse of the matching readX.

/** Write a `UInt8`: 1 byte (0 .. 255). Mirror of `readUInt8`. */
export function writeUInt8(sink: Sink, value: number): void {
  sink.buf[reserve(sink, 1)] = value;
}

/** Write an `Int8`: 1 byte, two's-complement signed (-128 .. 127). Mirror of `readInt8`. */
export function writeInt8(sink: Sink, value: number): void {
  sink.view.setInt8(reserve(sink, 1), value);
}

/** Write a `UInt16`: 2 bytes, little-endian. Mirror of `readUInt16`. */
export function writeUInt16(sink: Sink, value: number): void {
  sink.view.setUint16(reserve(sink, 2), value, true);
}

/** Write an `Int16`: 2 bytes, little-endian, two's-complement. Mirror of `readInt16`. */
export function writeInt16(sink: Sink, value: number): void {
  sink.view.setInt16(reserve(sink, 2), value, true);
}

/** Write a `UInt32`: 4 bytes, little-endian. Mirror of `readUInt32`. */
export function writeUInt32(sink: Sink, value: number): void {
  sink.view.setUint32(reserve(sink, 4), value, true);
}

/** Write an `Int32`: 4 bytes, little-endian, two's-complement. Mirror of `readInt32`. */
export function writeInt32(sink: Sink, value: number): void {
  sink.view.setInt32(reserve(sink, 4), value, true);
}

/**
 * Write a `UInt64`: 8 bytes, little-endian. Takes a `bigint` (mirror of
 * `readUInt64`). Uses Node's `Buffer.writeBigUInt64LE`, which writes the 64-bit
 * value straight from the bigint — no narrowing to a JS number. The value must be
 * in `[0, 2^64)`.
 */
export function writeUInt64(sink: Sink, value: bigint): void {
  sink.buf.writeBigUInt64LE(value, reserve(sink, 8));
}

/**
 * Write an `Int64`: 8 bytes, little-endian, two's-complement. Takes a `bigint`
 * (mirror of `readInt64`). Uses Node's `Buffer.writeBigInt64LE`, writing the
 * signed 64-bit value straight from the bigint (range `[-2^63, 2^63)`).
 */
export function writeInt64(sink: Sink, value: bigint): void {
  sink.buf.writeBigInt64LE(value, reserve(sink, 8));
}

/** Mask reducing a bigint word to its unsigned 64-bit (two's-complement) value. */
const MASK64 = (1n << 64n) - 1n;

/**
 * Write a `UInt128`/`Int128`: 16 bytes, little-endian, as two 64-bit words (low
 * then high). Each word is masked to 64 bits with `& MASK64` — a pure bigint
 * operation that yields the correct unsigned (two's-complement) representation for
 * negatives too — and written with Node's `Buffer.writeBigUInt64LE`, so this one
 * function serves both `readUInt128` and `readInt128` without narrowing to a JS
 * number.
 */
export function writeUInt128(sink: Sink, value: bigint): void {
  const o = reserve(sink, 16);
  sink.buf.writeBigUInt64LE(value & MASK64, o);
  sink.buf.writeBigUInt64LE((value >> 64n) & MASK64, o + 8);
}

/** Write an `Int128`: 16 bytes LE two's-complement. Same word layout as {@link writeUInt128}. */
export const writeInt128 = writeUInt128;

/**
 * Write a `UInt256`/`Int256`: 32 bytes, little-endian, as four 64-bit words
 * (least-significant first). Like {@link writeUInt128}, each word is masked with
 * `& MASK64` and written via `Buffer.writeBigUInt64LE`, handling both unsigned and
 * signed (two's complement) values straight from the bigint.
 */
export function writeUInt256(sink: Sink, value: bigint): void {
  const o = reserve(sink, 32);
  sink.buf.writeBigUInt64LE(value & MASK64, o);
  sink.buf.writeBigUInt64LE((value >> 64n) & MASK64, o + 8);
  sink.buf.writeBigUInt64LE((value >> 128n) & MASK64, o + 16);
  sink.buf.writeBigUInt64LE((value >> 192n) & MASK64, o + 24);
}

/** Write an `Int256`: 32 bytes LE two's-complement. Same word layout as {@link writeUInt256}. */
export const writeInt256 = writeUInt256;
