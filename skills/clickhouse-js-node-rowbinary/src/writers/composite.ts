import { type Writer } from "./core.js";
import { writeUInt8 } from "./integers.js";
import { writeUVarint } from "./varint.js";

// --- Writers: the encode mirror of the combinators in `composite.ts`. Each takes
// sub-WRITERS (instead of sub-readers) and returns a Writer; MONOMORPHIZE when
// generating code, exactly as noted for the readers.

/**
 * Write a `Nullable(T)`: a 1-byte null flag (0 = present, 1 = NULL), then the
 * inner value ONLY when present. The inverse of `readNullable`; curried — pass the
 * inner writer, get a `Writer<T | null>`.
 */
export function writeNullable<T>(writeValue: Writer<T>): Writer<T | null> {
  return (sink, value) => {
    if (value === null) {
      writeUInt8(sink, 1);
    } else {
      writeUInt8(sink, 0);
      writeValue(sink, value);
    }
  };
}

/**
 * Write an `Array(T)`: a LEB128 element count, then each element back-to-back. The
 * inverse of `readArray`; curried — pass the element writer, get a `Writer<T[]>`.
 */
export function writeArray<T>(writeElement: Writer<T>): Writer<readonly T[]> {
  return (sink, values) => {
    writeUVarint(sink, values.length);
    // C-style loop, not for-of: this is a hot path and we don't want the
    // iterator protocol overhead on a plain array.
    for (let i = 0; i < values.length; i++) writeElement(sink, values[i]!);
  };
}

/**
 * Write a `QBit(element_type, dimension)`: in RowBinary it is byte-for-byte an
 * `Array(element_type)`, so this is just {@link writeArray}. The inverse of
 * `readQBit`.
 */
export function writeQBit<T>(writeElement: Writer<T>): Writer<readonly T[]> {
  return writeArray(writeElement);
}

/**
 * Write a `Tuple(...)` from a positional array: each element's value
 * back-to-back, with NO count and NO delimiter. The inverse of `readTuple`;
 * curried — pass one writer per element (in order), get a `Writer` of the tuple.
 */
export function writeTuple<T extends readonly unknown[]>(writers: {
  [K in keyof T]: Writer<T[K]>;
}): Writer<T> {
  const fns = writers as ReadonlyArray<Writer<unknown>>;
  return (sink, value) => {
    for (let i = 0; i < fns.length; i++) fns[i]!(sink, value[i]);
  };
}

/**
 * Write a named `Tuple(name1 T1, ...)` from an object. The wire is identical to an
 * unnamed tuple — values back-to-back, no count or delimiter — so the writers run
 * in the `writers` object's key order, which MUST match the tuple's declared field
 * order. The inverse of `readTupleNamed`; curried.
 */
export function writeTupleNamed<T extends Record<string, unknown>>(writers: {
  [K in keyof T]: Writer<T[K]>;
}): Writer<T> {
  const fns = writers as Record<string, Writer<unknown>>;
  const keys = Object.keys(fns);
  return (sink, value) => {
    // C-style loop, not for-of: hot path, plain array of keys.
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      fns[key]!(sink, value[key]);
    }
  };
}

/**
 * Write a `Map(K, V)`: a LEB128 pair count, then key/value interleaved
 * (k, v, k, v, ...). The inverse of `readMap`; curried — pass the key and value
 * writers, get a `Writer<Map<K, V>>` (`Map` iteration order is preserved).
 */
export function writeMap<K, V>(
  writeKey: Writer<K>,
  writeValue: Writer<V>,
): Writer<ReadonlyMap<K, V>> {
  return (sink, map) => {
    writeUVarint(sink, map.size);
    // for-of is intentional here: it is the fastest way to iterate a `Map`
    // (unlike plain arrays, where a C-style index loop wins).
    for (const [key, value] of map) {
      writeKey(sink, key);
      writeValue(sink, value);
    }
  };
}

/**
 * A tagged `Variant` value for {@link writeVariant}: the active alternative's
 * `discriminant` (its index in the sorted-type-name order) paired with its value,
 * or `null` for a NULL.
 *
 * WHY TAGGED: `readVariant` returns only the decoded VALUE — the discriminant is
 * consumed from the wire and not surfaced — so encode cannot recover which
 * alternative a bare value belongs to (e.g. is `5` the `UInt8` or the `Int32`
 * alternative?). The discriminant must therefore be supplied explicitly, the
 * encode-side analog of the `readGeometry` switch.
 */
export type VariantValue =
  | readonly [discriminant: number, value: unknown]
  | null;

/**
 * Write a `Variant(T1, ..., Tn)`: a 1-byte discriminant then the chosen
 * alternative's value (discriminant `0xFF` = NULL, no value). The inverse of
 * `readVariant`; curried — pass the alternative writers in sorted-type-name order
 * (same order the reader expects), get a `Writer<VariantValue>`.
 */
export function writeVariant(
  writers: ReadonlyArray<Writer<never>>,
): Writer<VariantValue> {
  return (sink, value) => {
    if (value === null) {
      writeUInt8(sink, 0xff);
      return;
    }
    const [discriminant, inner] = value;
    const fn = writers[discriminant] as Writer<unknown> | undefined;
    if (fn === undefined) {
      throw new RangeError(
        `RowBinary Variant: discriminant ${discriminant} out of range (${writers.length} alternatives)`,
      );
    }
    writeUInt8(sink, discriminant);
    fn(sink, inner);
  };
}
