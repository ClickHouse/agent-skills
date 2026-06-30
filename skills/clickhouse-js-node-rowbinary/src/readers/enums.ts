import { type Reader, advance } from "./core.js";

/**
 * Maps an enum's underlying integer to its name. Built from the type's
 * `'name' = value` pairs (which live in the column type, not the wire) by the
 * compile step / dynamic decoder and handed to the readers below.
 */
export type EnumNameMap = ReadonlyMap<number, string>;

/**
 * Read an `Enum8` and resolve it to its NAME — the ergonomic default, since the
 * point of an enum is usually the label, not the raw `Int8`.
 *
 * This is a factory: the name<->value map is metadata carried by the type, not
 * the bytes, so it is supplied once (per column) and closed over. A value with
 * no matching name falls back to its stringified integer rather than throwing,
 * so a decode never blows up on an unexpected wire value.
 *
 * Need the raw underlying integer instead (e.g. a monomorphized hot path that
 * has the schema baked in)? Read it directly with {@link readInt8} — that is the
 * fast, allocation-free path the enum's name resolution sits on top of.
 */
export function readEnum8(valueToName: EnumNameMap): Reader<string> {
  return (state) =>
    resolveName(valueToName, state.view.getInt8(advance(state, 1)));
}

/**
 * Read an `Enum16` (2-byte underlying `Int16`) and resolve it to its NAME. See
 * {@link readEnum8}; use {@link readInt16} for the raw underlying integer.
 */
export function readEnum16(valueToName: EnumNameMap): Reader<string> {
  return (state) =>
    resolveName(valueToName, state.view.getInt16(advance(state, 2), true));
}

function resolveName(valueToName: EnumNameMap, value: number): string {
  const name = valueToName.get(value);
  return name !== undefined ? name : String(value);
}
