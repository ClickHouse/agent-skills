import { type Writer } from "./core.js";

/**
 * `LowCardinality(T)` is TRANSPARENT in RowBinary (no dictionary layer on the
 * wire), so there is nothing extra to encode: use `T`'s own writer directly.
 * This identity combinator mirrors `readLowCardinality` and returns the inner
 * writer unchanged:
 *
 *   writeLowCardinality(writeString) === writeString
 */
export const writeLowCardinality = <T>(writeValue: Writer<T>): Writer<T> =>
  writeValue;
