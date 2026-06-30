import { type Reader } from "./core.js";
import { readInt32, readInt64, readInt128, readInt256 } from "./integers.js";

/**
 * A decimal kept lossless as its raw parts: `value = unscaled / 10 ** scale`.
 * The `readDecimal*` readers return this so no precision or scale information is
 * thrown away at decode time.
 */
export type DecimalValue = readonly [unscaled: bigint, scale: number];

/**
 * Format a {@link DecimalValue} as a fixed-point decimal string with `scale`
 * fractional digits (e.g. `[15000n, 4]` -> `"1.5000"`). Plug in only when you
 * need a string.
 *
 * Trailing zeros are preserved to reflect the declared scale, deliberately unlike
 * ClickHouse's text output, which trims them (`"1.5"`) and drops the point for
 * integers (`"10"`).
 */
export function formatDecimal([unscaled, scale]: DecimalValue): string {
  if (scale === 0) return unscaled.toString();
  if (unscaled < 0n) {
    const digits = (-unscaled).toString().padStart(scale + 1, "0");
    const point = digits.length - scale;
    return `-${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  const digits = unscaled.toString().padStart(scale + 1, "0");
  const point = digits.length - scale;
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * Read a `Decimal32(P, S)`: a 4-byte little-endian signed integer (same wire
 * shape as `Int32`) scaled by 10^S. Pass the column's scale `S`; returns a
 * `Reader` of the raw `[unscaled, scale]` pair (see {@link formatDecimal}).
 *
 * `Decimal(P, S)` is an alias: pick the width reader by precision P — P<=9 ->
 * Decimal32, <=18 -> Decimal64, <=38 -> Decimal128, <=76 -> Decimal256.
 */
export function readDecimal32(scale: number): Reader<DecimalValue> {
  return (state) => [BigInt(readInt32(state)), scale];
}

/** Read a `Decimal64(P, S)`: 8-byte LE signed integer scaled by 10^S. Returns `[unscaled, scale]`; see {@link formatDecimal}. */
export function readDecimal64(scale: number): Reader<DecimalValue> {
  return (state) => [readInt64(state), scale];
}

/** Read a `Decimal128(P, S)`: 16-byte LE signed integer scaled by 10^S. Returns `[unscaled, scale]`; see {@link formatDecimal}. */
export function readDecimal128(scale: number): Reader<DecimalValue> {
  return (state) => [readInt128(state), scale];
}

/** Read a `Decimal256(P, S)`: 32-byte LE signed integer scaled by 10^S. Returns `[unscaled, scale]`; see {@link formatDecimal}. */
export function readDecimal256(scale: number): Reader<DecimalValue> {
  return (state) => [readInt256(state), scale];
}
