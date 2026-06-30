import { type Writer } from "./core.js";

/**
 * `SimpleAggregateFunction(func, T)` is TRANSPARENT in RowBinary — the column
 * holds a finished value of `T` — so encode the inner `T` directly. Identity
 * combinator mirroring `readSimpleAggregateFunction`:
 *
 *   writeSimpleAggregateFunction(writeUInt64) === writeUInt64
 */
export const writeSimpleAggregateFunction = <T>(
  writeValue: Writer<T>,
): Writer<T> => writeValue;
