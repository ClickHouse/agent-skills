import { type Writer, Sink, reserve } from "./core.js";
import { type Microseconds, type Nanoseconds } from "../readers/datetime.js";

const MS_PER_DAY = 86_400_000;

/**
 * Write a `Date`: 2-byte `UInt16` count of days since 1970-01-01 (UTC). The
 * inverse of `readDate` — the `Date` it produced is at UTC midnight, so
 * `getTime() / 86_400_000` recovers the whole-day count exactly. A non-midnight
 * input is floored to its calendar day (matching ClickHouse's truncation),
 * never rounded up into the next day.
 *
 * PRECONDITION: a valid `Date` whose day count fits the `UInt16` range
 * (1970-01-01 … ~2149-06-06). Like every leaf writer (see `writeUVarint`) this
 * is not range-checked — an invalid or out-of-range `Date` (e.g. a pre-1970 one,
 * which belongs in {@link writeDate32}) is a programming error; the resulting
 * bytes are rejected server-side.
 */
export function writeDate(sink: Sink, value: Date): void {
  sink.view.setUint16(
    reserve(sink, 2),
    Math.floor(value.getTime() / MS_PER_DAY),
    true,
  );
}

/**
 * Write a `Date32`: 4-byte signed `Int32` count of days since 1970-01-01 (UTC),
 * negative for pre-1970 dates. The inverse of `readDate32`. A non-midnight input
 * is floored toward -inf to its calendar day, so pre-1970 instants land on the
 * correct (more negative) day rather than rounding toward the epoch.
 *
 * PRECONDITION: a valid `Date` whose day count fits `Int32`. Not range-checked
 * (as elsewhere) — an invalid `Date` is a programming error, rejected server-side.
 */
export function writeDate32(sink: Sink, value: Date): void {
  sink.view.setInt32(
    reserve(sink, 4),
    Math.floor(value.getTime() / MS_PER_DAY),
    true,
  );
}

/**
 * Write a `DateTime`: 4-byte `UInt32` Unix seconds. The inverse of `readDateTime`;
 * the column timezone is metadata, not in the bytes. Sub-second components are
 * floored away (matching the reader and `writeDateTime64`'s `Math.floor`), never
 * rounded up to the next second.
 *
 * PRECONDITION: a valid `Date` whose Unix-seconds fit the `UInt32` range
 * (1970-01-01 … 2106-02-07). Not range-checked (as elsewhere) — an invalid or
 * out-of-range `Date` is a programming error, rejected server-side.
 */
export function writeDateTime(sink: Sink, value: Date): void {
  sink.view.setUint32(
    reserve(sink, 4),
    Math.floor(value.getTime() / 1000),
    true,
  );
}

/**
 * Write a `DateTime64(P)`: 8-byte signed `Int64` count of `10^-P`-second ticks.
 * Curried: `writeDateTime64(P)` returns the writer. The inverse of
 * `readDateTime64`, which returns `[date, nanoseconds]` (date truncated to whole
 * seconds, nanoseconds the sub-second remainder regardless of P). This recombines
 * them: `ticks = seconds * 10^P + nanoseconds / 10^(9 - P)`. The reader floors
 * seconds toward -inf with a non-negative remainder, so the seconds are computed
 * with `Math.floor` on the cheap JS-number millisecond value (not bigint division,
 * which truncates toward zero) — exact for negative instants too.
 */
export function writeDateTime64(
  precision: number,
): Writer<[Date, Nanoseconds]> {
  const scale = 10n ** BigInt(precision);
  const nsPerTick = 10n ** BigInt(9 - precision);
  return (sink, [date, nanoseconds]) => {
    const seconds = BigInt(Math.floor(date.getTime() / 1000));
    sink.buf.writeBigInt64LE(
      seconds * scale + BigInt(nanoseconds) / nsPerTick,
      reserve(sink, 8),
    );
  };
}

/**
 * Write a `DateTime64(3)` (milliseconds) from a plain `Date` — the inverse of
 * `readDateTime64P3`. P=3 is a `Date`'s own resolution, so the tick count is
 * exactly `getTime()` in milliseconds.
 */
export function writeDateTime64P3(sink: Sink, value: Date): void {
  sink.buf.writeBigInt64LE(BigInt(value.getTime()), reserve(sink, 8));
}

/**
 * Write a `DateTime64(6)` (microseconds) from `[date, microseconds]` — the
 * inverse of `readDateTime64P6`. `ticks = seconds * 1_000_000 + micros`.
 */
export function writeDateTime64P6(
  sink: Sink,
  [date, microseconds]: [Date, Microseconds],
): void {
  const seconds = BigInt(Math.floor(date.getTime() / 1000));
  sink.buf.writeBigInt64LE(
    seconds * 1_000_000n + BigInt(microseconds),
    reserve(sink, 8),
  );
}

/**
 * Write a `DateTime64(9)` (nanoseconds) from `[date, nanoseconds]` — the inverse
 * of `readDateTime64P9`. `ticks = seconds * 1_000_000_000 + nanos`.
 */
export function writeDateTime64P9(
  sink: Sink,
  [date, nanoseconds]: [Date, Nanoseconds],
): void {
  const seconds = BigInt(Math.floor(date.getTime() / 1000));
  sink.buf.writeBigInt64LE(
    seconds * 1_000_000_000n + BigInt(nanoseconds),
    reserve(sink, 8),
  );
}
