import { Cursor, advance } from "./core.js";

/** Read a single unsigned byte and advance. */
export function readUInt8(state: Cursor): number {
  return state.buf[advance(state, 1)]!;
}

/** Read an `Int8`: 1 byte, two's-complement signed (-128 .. 127). */
export function readInt8(state: Cursor): number {
  return state.view.getInt8(advance(state, 1));
}

/** Read a `UInt16`: 2 bytes, little-endian (0 .. 65535). */
export function readUInt16(state: Cursor): number {
  return state.view.getUint16(advance(state, 2), true);
}

/**
 * Read an `Int16`: 2 bytes, little-endian, two's-complement signed (-32768 ..
 * 32767). `DataView` reads from any offset and decodes explicitly little-endian,
 * so the value never depends on host byte order.
 */
export function readInt16(state: Cursor): number {
  return state.view.getInt16(advance(state, 2), true);
}

/** Read a `UInt32`: 4 bytes, little-endian (0 .. 4294967295). */
export function readUInt32(state: Cursor): number {
  return state.view.getUint32(advance(state, 4), true);
}

/** Read an `Int32`: 4 bytes, little-endian, two's-complement signed. */
export function readInt32(state: Cursor): number {
  return state.view.getInt32(advance(state, 4), true);
}

/**
 * Read a `UInt64`: 8 bytes, little-endian. Returns a `bigint`.
 * SAFE TO TOGGLE: if the values fit in 53 bits, wrap in `Number(...)`.
 */
export function readUInt64(state: Cursor): bigint {
  return state.view.getBigUint64(advance(state, 8), true);
}

/**
 * Read an `Int64`: 8 bytes, little-endian, two's-complement. Returns a `bigint`
 * (range exceeds `Number.MAX_SAFE_INTEGER`).
 * SAFE TO TOGGLE: if the values fit in 53 bits, wrap in `Number(...)`.
 */
export function readInt64(state: Cursor): bigint {
  return state.view.getBigInt64(advance(state, 8), true);
}

/** Read a `UInt128`: 16 bytes, little-endian. Always a `bigint`. */
export function readUInt128(state: Cursor): bigint {
  const start = advance(state, 16);
  const lo = state.view.getBigUint64(start, true);
  const hi = state.view.getBigUint64(start + 8, true);
  return (hi << 64n) + lo;
}

/**
 * Read an `Int128`: 16 bytes, little-endian, two's-complement. Always a
 * `bigint`, composed from the low (unsigned) and high (signed) 64-bit words —
 * reading the high word signed extends the sign across all 128 bits.
 */
export function readInt128(state: Cursor): bigint {
  const start = advance(state, 16);
  const lo = state.view.getBigUint64(start, true);
  const hi = state.view.getBigInt64(start + 8, true);
  return (hi << 64n) + lo;
}

/** Read a `UInt256`: 32 bytes, little-endian. Always a `bigint`. */
export function readUInt256(state: Cursor): bigint {
  const start = advance(state, 32);
  const w0 = state.view.getBigUint64(start, true);
  const w1 = state.view.getBigUint64(start + 8, true);
  const w2 = state.view.getBigUint64(start + 16, true);
  const w3 = state.view.getBigUint64(start + 24, true);
  return w0 + (w1 << 64n) + (w2 << 128n) + (w3 << 192n);
}

/**
 * Read an `Int256`: 32 bytes, little-endian, two's-complement. Always a
 * `bigint`. The most-significant 64-bit word is read signed.
 */
export function readInt256(state: Cursor): bigint {
  const start = advance(state, 32);
  const w0 = state.view.getBigUint64(start, true);
  const w1 = state.view.getBigUint64(start + 8, true);
  const w2 = state.view.getBigUint64(start + 16, true);
  const w3 = state.view.getBigInt64(start + 24, true);
  return (w3 << 192n) + (w2 << 128n) + (w1 << 64n) + w0;
}
