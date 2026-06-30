import { Sink, reserve } from "./core.js";

/**
 * Write an `Enum8`: the value's underlying signed `Int8` (1 byte). Mirror of
 * `readEnum8` — the name<->value map lives in the column type, so take the raw
 * numeric value.
 */
export function writeEnum8(sink: Sink, value: number): void {
  sink.view.setInt8(reserve(sink, 1), value);
}

/**
 * Write an `Enum16`: the value's underlying signed `Int16` (2 bytes,
 * little-endian). Mirror of `readEnum16`.
 */
export function writeEnum16(sink: Sink, value: number): void {
  sink.view.setInt16(reserve(sink, 2), value, true);
}
