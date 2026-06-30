import { type Reader } from "./core.js";

/**
 * `Nothing` is the empty type: it has NO values and occupies ZERO bytes. It is
 * never a column on its own (you cannot materialize a value of it) — it only
 * appears wrapped, as the inferred element of an untyped literal:
 *
 *   []   -> Array(Nothing)     -> always the empty array (varint length 0x00)
 *   NULL -> Nullable(Nothing)  -> always NULL (lone flag byte 0x01)
 *
 * So a `Nothing` value is NEVER read: `readArray`'s element reader and
 * `readNullable`'s inner reader are not called in those cases (the array is
 * empty / the value is NULL). There is nothing to decode.
 *
 * Wire this in as the inner reader to make that invariant loud: it throws if it
 * is ever actually invoked, which would mean a `Nothing` reader was placed where
 * a real element/inner type was expected.
 *
 *   readArray(readNothing)      // [] — readNothing never runs
 *   readNullable(readNothing)   // null — readNothing never runs
 */
export const readNothing: Reader<never> = () => {
  throw new Error(
    "RowBinary: Nothing is zero-width and is never decoded — it only appears as " +
      "an empty Array(Nothing) or a NULL Nullable(Nothing), where the inner reader " +
      "is not called. Reaching here means a Nothing reader was wired where a real " +
      "element/inner type was expected.",
  );
};
