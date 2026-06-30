import { type Reader } from "./core.js";

/**
 * `SimpleAggregateFunction(func, T)` is TRANSPARENT in RowBinary: the column
 * already holds a finished value of the underlying type `T` (the partial
 * aggregate of a "simple" function — sum / min / max / groupArrayArray / … — is
 * just a value of `T`), so it is encoded byte-for-byte the same as `T`. Decode
 * the inner `T` directly.
 *
 * Do NOT confuse it with `AggregateFunction(func, T)`, whose value is an opaque
 * serialized aggregation STATE with a function-specific binary layout — see
 * `./aggregateFunction.js`.
 *
 * Identity combinator, documentation only:
 *
 *   readSimpleAggregateFunction(readUInt64) === readUInt64
 */
export const readSimpleAggregateFunction = <T>(
  readValue: Reader<T>,
): Reader<T> => readValue;
