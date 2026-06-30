import { Sink, reserve } from "./core.js";

/**
 * Parse a canonical `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` UUID string into the
 * raw 16 wire bytes — the inverse of `formatUUID`. ClickHouse stores a UUID as
 * two little-endian `UInt64` halves (high then low), so the 32 hex digits are
 * split at the midpoint and each half written little-endian. Pair with
 * {@link writeUUID}.
 */
export function parseUUID(text: string): Buffer {
  const hex = text.replace(/-/g, "");
  if (hex.length !== 32) {
    throw new RangeError(
      `RowBinary: invalid UUID string ${JSON.stringify(text)}`,
    );
  }
  const v = BigInt("0x" + hex);
  // SAFE: allocUnsafe — the two writeBigUInt64LE calls below overwrite all 16
  // bytes (offsets 0..7 and 8..15), so no uninitialized pool memory survives.
  const b = Buffer.allocUnsafe(16);
  b.writeBigUInt64LE(v >> 64n, 0); // high half -> first 8 bytes
  b.writeBigUInt64LE(v & 0xffffffffffffffffn, 8); // low half -> last 8 bytes
  return b;
}

/**
 * Write a `UUID` from its raw 16 wire bytes (as produced by `readUUID` or
 * {@link parseUUID}): copied verbatim. The inverse of `readUUID`. Throws unless
 * exactly 16 bytes are given.
 */
export function writeUUID(sink: Sink, value: Uint8Array): void {
  if (value.length !== 16) {
    throw new RangeError(
      `RowBinary: UUID must be 16 bytes, got ${value.length}`,
    );
  }
  const o = reserve(sink, 16);
  sink.buf.set(value, o);
}

/**
 * Write a `UUID` from a single 128-bit `bigint` (`hi << 64 | lo`) — the inverse
 * of `readUUIDBigInt`. The high 64 bits go to the first little-endian `UInt64`
 * half, the low 64 bits to the second.
 */
export function writeUUIDBigInt(sink: Sink, value: bigint): void {
  const o = reserve(sink, 16);
  sink.buf.writeBigUInt64LE((value >> 64n) & 0xffffffffffffffffn, o);
  sink.buf.writeBigUInt64LE(value & 0xffffffffffffffffn, o + 8);
}

/**
 * Write a `UUID` from its two raw little-endian `UInt64` halves `[hi, lo]` — the
 * inverse of `readUUIDHiLo`, the faithful wire split with no combining work.
 */
export function writeUUIDHiLo(sink: Sink, [hi, lo]: [bigint, bigint]): void {
  const o = reserve(sink, 16);
  sink.buf.writeBigUInt64LE(hi, o);
  sink.buf.writeBigUInt64LE(lo, o + 8);
}
