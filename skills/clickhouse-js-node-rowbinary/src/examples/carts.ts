import {
  readArray,
  readNullable,
  readTupleNamed,
} from "../readers/composite.js";
import { type Reader, advance } from "../readers/core.js";
import { readInt32, readUInt16, readUInt32 } from "../readers/integers.js";
import { readString } from "../readers/strings.js";
import { readUVarint } from "../readers/varint.js";

/**
 * Example: a carts table — nested generics.
 *
 * Columns (the trigger):
 *   cart_id   UInt32
 *   items     Array(Tuple(sku String, qty UInt16))
 *   discounts Array(Nullable(Int32))
 *
 * The element reader of an `Array` can itself be a combinator: `items` is an
 * `Array` whose element is a named `Tuple`, `discounts` an `Array` whose element
 * is a `Nullable`. Combinators nest to any depth, matching the column type.
 */
export type CartRow = {
  cartId: number;
  items: { sku: string; qty: number }[];
  discounts: (number | null)[];
};

export const readCartRow: Reader<CartRow> = (s) => ({
  cartId: readUInt32(s),
  items: readArray(readTupleNamed({ sku: readString, qty: readUInt16 }))(s),
  discounts: readArray(readNullable(readInt32))(s),
});

/**
 * Optimized {@link readCartRow}, monomorphized through the nesting: the API
 * version rebuilds the outer `readArray`, the inner `readTupleNamed`, and the
 * `readNullable` closures on every row (and the tuple reader iterates a keys
 * array per element). Here both arrays are inlined loops, the tuple element is a
 * flat object literal, and the nullable is an inline branch — no closures, no key
 * iteration, at either nesting level.
 *
 * MEASURED (Node 24 / V8, `carts.bench.ts`): ~2x faster — nested combinators
 * (outer `readArray`, inner `readTupleNamed` / `readNullable`) rebuilt per row in
 * the API version, all flattened here.
 */
export const readCartRowFast: Reader<CartRow> = (s) => {
  const { buf, view } = s;

  // cart_id UInt32.
  const cartId = view.getUint32(advance(s, 4), true);

  // items Array(Tuple(sku String, qty UInt16)): count, then per element a
  // length-prefixed string and a 2-byte int.
  const itemsN = readUVarint(s);
  const items = new Array<{ sku: string; qty: number }>(itemsN);
  for (let i = 0; i < itemsN; i++) {
    const len = readUVarint(s);
    const start = advance(s, len);
    const sku = buf.toString("utf8", start, start + len);
    const qty = view.getUint16(advance(s, 2), true);
    items[i] = { sku, qty };
  }

  // discounts Array(Nullable(Int32)): count, then per element a null-flag byte
  // and, if non-null, a 4-byte int.
  const discN = readUVarint(s);
  const discounts = new Array<number | null>(discN);
  for (let i = 0; i < discN; i++) {
    discounts[i] =
      buf[advance(s, 1)]! !== 0 ? null : view.getInt32(advance(s, 4), true);
  }

  return { cartId, items, discounts };
};
