import { type Writer } from "./core.js";
import { type DecimalValue } from "../readers/decimals.js";
import {
  writeInt32,
  writeInt64,
  writeInt128,
  writeInt256,
} from "./integers.js";

/**
 * Parse a fixed-point decimal string into a {@link DecimalValue} at the given
 * `scale` — the inverse of `formatDecimal`. `"1.5000"` with scale 4 ->
 * `[15000n, 4]`. A shorter fraction is right-padded with zeros to `scale`; a
 * longer one is truncated (not rounded). Plug in only when you start from a
 * string; if you already have the unscaled bigint, build the pair directly.
 */
export function parseDecimal(text: string, scale: number): DecimalValue {
  const neg = text.startsWith("-");
  const body = neg ? text.slice(1) : text;
  const dot = body.indexOf(".");
  const intPart = dot < 0 ? body : body.slice(0, dot);
  const fracPart = dot < 0 ? "" : body.slice(dot + 1);
  const frac = (fracPart + "0".repeat(scale)).slice(0, scale);
  let unscaled = BigInt((intPart || "0") + frac);
  if (neg) unscaled = -unscaled;
  return [unscaled, scale];
}

/**
 * Write a `Decimal32(P, S)`: the `unscaled` part of a {@link DecimalValue} as a
 * 4-byte little-endian signed integer (same wire as `Int32`). The inverse of
 * `readDecimal32`; the `scale` lives in the type, so only `unscaled` is written
 * (it must fit in `Int32`).
 *
 * `Decimal(P, S)` picks the width by precision P, exactly as the readers: P<=9 ->
 * Decimal32, <=18 -> Decimal64, <=38 -> Decimal128, <=76 -> Decimal256.
 */
export const writeDecimal32: Writer<DecimalValue> = (sink, [unscaled]) =>
  writeInt32(sink, Number(unscaled));

/** Write a `Decimal64(P, S)`: 8-byte LE signed integer. Inverse of `readDecimal64`. */
export const writeDecimal64: Writer<DecimalValue> = (sink, [unscaled]) =>
  writeInt64(sink, unscaled);

/** Write a `Decimal128(P, S)`: 16-byte LE signed integer. Inverse of `readDecimal128`. */
export const writeDecimal128: Writer<DecimalValue> = (sink, [unscaled]) =>
  writeInt128(sink, unscaled);

/** Write a `Decimal256(P, S)`: 32-byte LE signed integer. Inverse of `readDecimal256`. */
export const writeDecimal256: Writer<DecimalValue> = (sink, [unscaled]) =>
  writeInt256(sink, unscaled);
