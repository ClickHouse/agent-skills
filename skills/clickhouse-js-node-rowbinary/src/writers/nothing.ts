import { type Writer } from "./core.js";

/**
 * Inverse of `readNothing`: a `Nothing` value is NEVER written either. It only
 * appears wrapped, where the wrapper short-circuits before reaching it:
 *
 *   writeArray(writeNothing)      // only the empty array [] (length 0x00)
 *   writeNullable(writeNothing)   // only null (lone flag byte 0x01)
 *
 * In both cases the element/inner writer is not invoked. This writer throws if it
 * is ever actually called, which would mean a `Nothing` writer was placed where a
 * real element/inner type was expected.
 */
export const writeNothing: Writer<never> = () => {
  throw new Error(
    "RowBinary: Nothing is zero-width and is never encoded — it only appears as " +
      "an empty Array(Nothing) or a NULL Nullable(Nothing), where the inner writer " +
      "is not called. Reaching here means a Nothing writer was wired where a real " +
      "element/inner type was expected.",
  );
};
