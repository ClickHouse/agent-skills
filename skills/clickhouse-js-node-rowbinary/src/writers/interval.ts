import { writeInt64 } from "./integers.js";

/**
 * Write an `Interval` — any of `IntervalNanosecond` ... `IntervalYear`: a signed
 * `Int64` count of the unit. The inverse of `readInterval`; the unit lives in the
 * column type, not the bytes, so all 11 interval types share this writer.
 *
 * It IS `writeInt64` — assigned directly rather than wrapped, so there is no extra
 * call frame on the wire-write path.
 */
export const writeInterval = writeInt64;
