import { type Reader } from "./core.js";

/**
 * `LowCardinality(T)` is TRANSPARENT in RowBinary: it is encoded byte-for-byte
 * the same as `T`, with NO dictionary/index layer. (The dictionary encoding
 * exists only in the Native format — do not look for it here.) So there is
 * nothing to decode at this level: use `T`'s own reader directly.
 *
 * This identity combinator exists only to document that, and to let a generated
 * parser name the wrapper at the call site if it wants the type to read
 * literally — it returns the inner reader unchanged:
 *
 *   readLowCardinality(readString) === readString
 *
 * Prefer just calling the inner reader.
 */
export const readLowCardinality = <T>(readValue: Reader<T>): Reader<T> =>
  readValue;
