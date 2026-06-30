import { type Writer } from "./core.js";

/**
 * Inverse of `readAggregateFunction`: an `AggregateFunction(func, T…)` column is
 * OPAQUE, unframed aggregation state with a layout specific to `func` and the
 * server version, so it cannot be produced generically from a value. Build the
 * state server-side (the `-State` combinators) rather than encoding it on the
 * client.
 *
 * This writer throws to stop a generic encoder from emitting a misaligned row.
 */
export const writeAggregateFunction: Writer<never> = () => {
  throw new Error(
    "RowBinary: AggregateFunction is opaque, unframed aggregation state with no " +
      "length prefix — not generically encodable. Produce the state server-side " +
      "(the -State combinators) instead of encoding it on the client.",
  );
};
