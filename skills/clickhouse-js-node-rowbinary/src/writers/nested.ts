import { type Writer } from "./core.js";
import { writeArray, writeTupleNamed } from "./composite.js";

/**
 * Inverse of `readNested`: `Nested(...)` has no wire format of its own, so for the
 * `flatten_nested = 0` shape it is simply `Array(Tuple(a T1, b T2, …))`. This thin
 * alias composes the existing array + named-tuple writers, mirroring the reader:
 *
 *   writeNested({ a: writeUInt8, b: writeString })
 *     === writeArray(writeTupleNamed({ a: writeUInt8, b: writeString }))
 *
 * When generating code, prefer inlining (monomorphize the array + tuple) over this
 * generic composition.
 */
export const writeNested = <T extends Record<string, unknown>>(writers: {
  [K in keyof T]: Writer<T[K]>;
}): Writer<readonly T[]> => writeArray(writeTupleNamed(writers));
