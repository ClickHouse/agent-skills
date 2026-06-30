import { type Writer, Sink } from "./core.js";
import { type ScaledTicks, type Seconds } from "../readers/time.js";
import { writeInt32, writeInt64 } from "./integers.js";

/**
 * Write a `Time`: 4-byte signed `Int32` seconds-of-day. The inverse of `readTime`;
 * pair with {@link parseTime} to start from an "[-]HH:MM:SS" string.
 */
export function writeTime(sink: Sink, value: Seconds): void {
  writeInt32(sink, value);
}

/**
 * Write a `Time64(P)`: 8-byte signed `Int64` count of `10^-P`-second ticks, from
 * a {@link ScaledTicks} `[ticks, precision]`. The inverse of `readTime64`; the
 * precision lives in the type, so only `ticks` is written. Pair with
 * {@link parseTime64} to start from a string.
 */
export const writeTime64: Writer<ScaledTicks> = (sink, [ticks]) =>
  writeInt64(sink, ticks);

/**
 * Parse an "[-]HH:MM:SS" string into signed seconds-of-day — the inverse of
 * `formatTime`. The hour field may exceed two digits (range ±999:59:59).
 */
export function parseTime(text: string): Seconds {
  const neg = text.startsWith("-");
  const body = neg ? text.slice(1) : text;
  const [hh, mm, ss] = body.split(":");
  const seconds = Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
  return neg ? -seconds : seconds;
}

/**
 * Parse an "[-]HH:MM:SS[.fff]" string into a {@link ScaledTicks} at the given
 * `precision` — the inverse of `formatTime64`. A shorter fraction is right-padded
 * with zeros to `precision`; a longer one is truncated.
 */
export function parseTime64(text: string, precision: number): ScaledTicks {
  const neg = text.startsWith("-");
  const body = neg ? text.slice(1) : text;
  const dot = body.indexOf(".");
  const timePart = dot < 0 ? body : body.slice(0, dot);
  const fracPart = dot < 0 ? "" : body.slice(dot + 1);
  const [hh, mm, ss] = timePart.split(":");
  const scale = 10n ** BigInt(precision);
  const wholeSeconds =
    BigInt(Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * scale;
  const frac = BigInt(
    (fracPart + "0".repeat(precision)).slice(0, precision) || "0",
  );
  const ticks = wholeSeconds + frac;
  return [neg ? -ticks : ticks, precision];
}
