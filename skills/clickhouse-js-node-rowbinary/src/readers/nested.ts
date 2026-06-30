import { readArray, readTupleNamed } from "./composite.js";
import { type Reader } from "./core.js";

/**
 * `Nested(a T1, b T2, …)` has NO wire format of its own:
 *  - `flatten_nested = 1` (the default): the column expands into separate
 *    columns `a Array(T1)`, `b Array(T2)`, … — decode each with `readArray`.
 *  - `flatten_nested = 0`: the column is `Array(Tuple(a T1, b T2, …))` — decode
 *    with `readArray` + `readTupleNamed`.
 *
 * Either way it reuses existing readers; there is no dedicated Nested wire. This
 * thin alias just composes the two for the `flatten_nested = 0` shape, as
 * documentation that "Nested === Array(Tuple(...))":
 *
 *   readNested({ a: readUInt8, b: readString })
 *     === readArray(readTupleNamed({ a: readUInt8, b: readString }))
 *
 * When generating code, prefer inlining (monomorphize the array + tuple) over
 * this generic composition.
 */
export const readNested = <T extends Record<string, unknown>>(fields: {
  [K in keyof T]: Reader<T[K]>;
}): Reader<T[]> => readArray(readTupleNamed(fields));
