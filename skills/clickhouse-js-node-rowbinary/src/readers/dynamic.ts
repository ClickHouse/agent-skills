import { type Reader, Cursor } from "./core.js";
import { readUVarint } from "./varint.js";
import {
  readInt8,
  readInt16,
  readInt32,
  readInt64,
  readInt128,
  readInt256,
  readUInt8,
  readUInt16,
  readUInt32,
  readUInt64,
  readUInt128,
  readUInt256,
} from "./integers.js";
import { readBool } from "./bool.js";
import { readEnum8, readEnum16 } from "./enums.js";
import { readFloat32, readFloat64 } from "./floats.js";
import { readString, readFixedString } from "./strings.js";
import { readUUID } from "./uuid.js";
import { readIPv4, readIPv6 } from "./ip.js";
import {
  readDate,
  readDate32,
  readDateTime,
  readDateTime64,
} from "./datetime.js";
import {
  readDecimal32,
  readDecimal64,
  readDecimal128,
  readDecimal256,
} from "./decimals.js";
import {
  INTERVAL_UNITS,
  type IntervalValue,
  readInterval,
} from "./interval.js";
import {
  readArray,
  readMap,
  readNullable,
  readTuple,
  readTupleNamed,
  readVariant,
} from "./composite.js";
import { readJSON } from "./json.js";

/**
 * Read one `Dynamic` value. A `Dynamic` is SELF-DESCRIBING: every value is a
 * binary TYPE ENCODING followed by the value's RowBinary bytes. So unlike every
 * other reader, the type is not known until runtime — this is the one place a
 * generic runtime dispatch is correct and unavoidable. {@link readDynamicType}
 * parses the type header into a value `Reader`; here we just invoke it.
 *
 * GOTCHA — wrappers are erased. `Dynamic` stores the CONCRETE type of the stored
 * value, never a wrapper: a non-null `Nullable(UInt8)` is stored as plain
 * `UInt8`, an active `Variant(...)` as just its current alternative's type. A
 * NULL (from any source) is stored as `Nothing` (tag 0x00) and decodes to
 * `null`. So you never see Nullable/Variant tags here.
 *
 * For a Dynamic-heavy hot path where the same few types recur, parse the type
 * once and reuse the returned reader across rows instead of re-parsing.
 */
export function readDynamic(state: Cursor): unknown {
  return readDynamicType(state)(state);
}

/**
 * Parse a binary TYPE ENCODING (the header ClickHouse writes before each
 * `Dynamic` value) and return a `Reader` that reads ONE value of that type. The
 * type bytes are consumed now; the returned reader consumes only value bytes
 * when called. Composites recurse: element/key/field types are parsed eagerly
 * into inner readers, then composed with the existing combinators
 * ({@link readArray}/{@link readTuple}/{@link readMap}/...).
 *
 * The leading byte is a 1-byte tag; parameterized types (FixedString, Enum,
 * Decimal, DateTime64, timezone'd DateTime) carry extra LEB128/varint and string
 * fields in the header, which we consume to reach the value reader.
 *
 * Only the tags ClickHouse actually emits for stored `Dynamic` values are
 * handled (wrappers are erased — see {@link readDynamic}). Unknown tags throw
 * with the tag value so you can extend this switch for the types your data
 * actually contains.
 */
export function readDynamicType(state: Cursor): Reader<unknown> {
  const tag = readUInt8(state);
  switch (tag) {
    // Nothing — a stored NULL. Zero value bytes.
    case 0x00:
      return () => null;
    // Unsigned integers.
    case 0x01:
      return readUInt8;
    case 0x02:
      return readUInt16;
    case 0x03:
      return readUInt32;
    case 0x04:
      return readUInt64;
    case 0x05:
      return readUInt128;
    case 0x06:
      return readUInt256;
    // Signed integers.
    case 0x07:
      return readInt8;
    case 0x08:
      return readInt16;
    case 0x09:
      return readInt32;
    case 0x0a:
      return readInt64;
    case 0x0b:
      return readInt128;
    case 0x0c:
      return readInt256;
    // Floats.
    case 0x0d:
      return readFloat32;
    case 0x0e:
      return readFloat64;
    // Dates and times. The timezone'd variants carry a tz string in the header
    // (metadata only — identical value wire to the untimezoned form).
    case 0x0f:
      return readDate;
    case 0x10:
      return readDate32;
    case 0x11:
      return readDateTime;
    case 0x12:
      readString(state); // timezone name (metadata)
      return readDateTime;
    case 0x13:
      return readDateTime64(readUVarint(state));
    case 0x14: {
      const precision = readUVarint(state);
      readString(state); // timezone name (metadata)
      return readDateTime64(precision);
    }
    // String / FixedString(N).
    case 0x15:
      return readString;
    case 0x16:
      return readFixedString(readUVarint(state));
    // Enum8 / Enum16: a count then (name String, value Int8/Int16) pairs. We
    // collect them into the name<->value map so the value resolves to its name,
    // matching the textual-type path in compile.ts.
    case 0x17: {
      const n = readUVarint(state);
      const map = new Map<number, string>();
      for (let i = 0; i < n; i++) {
        const name = readString(state);
        map.set(readInt8(state), name);
      }
      return readEnum8(map);
    }
    case 0x18: {
      const n = readUVarint(state);
      const map = new Map<number, string>();
      for (let i = 0; i < n; i++) {
        const name = readString(state);
        map.set(readInt16(state), name);
      }
      return readEnum16(map);
    }
    // Decimals: header carries precision P then scale S (both varint). Only S
    // matters for decoding; P is consumed and dropped. Returns [unscaled, S].
    case 0x19: {
      readUVarint(state);
      return readDecimal32(readUVarint(state));
    }
    case 0x1a: {
      readUVarint(state);
      return readDecimal64(readUVarint(state));
    }
    case 0x1b: {
      readUVarint(state);
      return readDecimal128(readUVarint(state));
    }
    case 0x1c: {
      readUVarint(state);
      return readDecimal256(readUVarint(state));
    }
    case 0x1d:
      return readUUID;
    // Array(T): parse the element type once, then read a length-prefixed run.
    case 0x1e:
      return readArray(readDynamicType(state));
    // Tuple(...): a field count, then that many element type encodings.
    case 0x1f: {
      const n = readUVarint(state);
      const fields: Array<Reader<unknown>> = [];
      for (let i = 0; i < n; i++) fields.push(readDynamicType(state));
      return readTuple(fields);
    }
    // Named Tuple: a count, then (name String, type) pairs. Names shape the
    // result object; the value wire is identical to an unnamed tuple.
    case 0x20: {
      const n = readUVarint(state);
      const fields: Record<string, Reader<unknown>> = {};
      for (let i = 0; i < n; i++) {
        const name = readString(state);
        fields[name] = readDynamicType(state);
      }
      return readTupleNamed(fields);
    }
    // Set (0x21): a type used inside IN-expressions, not a stored column value.
    case 0x21:
      throw new RangeError(
        "RowBinary: Dynamic type 0x21 (Set) has no decodable value form",
      );
    // Interval (0x22): the header carries a 1-byte unit kind (0x00 Nanosecond
    // ... 0x0a Year), then the value is a signed Int64 count of that unit. Here
    // — unlike a standalone Interval* column — the unit IS in the wire, so we
    // pair it with the count as an IntervalValue rather than dropping it.
    case 0x22: {
      const kind = readUInt8(state);
      const unit = INTERVAL_UNITS[kind];
      if (unit === undefined) {
        throw new RangeError(
          `RowBinary: unknown Interval kind ${kind} in Dynamic type encoding`,
        );
      }
      return (s): IntervalValue => [readInterval(s), unit];
    }
    // Nullable(T): a NULL flag byte then (if not null) the inner value. At the
    // TOP level Dynamic erases Nullable, but NESTED inside Array/Tuple/Map the
    // element type really is Nullable(T) — e.g. Array(Nullable(UInt8)) — so the
    // tag does appear here.
    case 0x23:
      return readNullable(readDynamicType(state));
    // Function (0x24): a higher-order function type (lambda), header-only with no
    // stored value form.
    case 0x24:
      throw new RangeError(
        "RowBinary: Dynamic type 0x24 (Function) has no decodable value form",
      );
    // AggregateFunction (0x25): an opaque, UNFRAMED aggregation state with a
    // function-specific layout and no length prefix, so it cannot be decoded OR
    // skipped generically. Finalize server-side before putting it in a Dynamic.
    case 0x25:
      throw new RangeError(
        "RowBinary: Dynamic type 0x25 (AggregateFunction) is an opaque unframed state — finalize it server-side",
      );
    // LowCardinality(T): transparent — keep the inner type's reader as-is.
    case 0x26:
      return readDynamicType(state);
    // Map(K, V): parse the key type then the value type.
    case 0x27: {
      const key = readDynamicType(state);
      const value = readDynamicType(state);
      return readMap(key, value);
    }
    case 0x28:
      return readIPv4;
    case 0x29:
      return readIPv6;
    // Variant (0x2a): the header is (count, then each alternative's type
    // encoding). ClickHouse writes the alternatives ALREADY SORTED by type name,
    // so the parsed readers line up with the discriminant directly. The value is
    // a 1-byte discriminant (0xff = NULL) then the chosen value. NOTE: top-level
    // Dynamic erases Variant, so this tag only appears NESTED.
    case 0x2a: {
      const n = readUVarint(state);
      const alternatives: Array<Reader<unknown>> = [];
      for (let i = 0; i < n; i++) alternatives.push(readDynamicType(state));
      return readVariant(alternatives);
    }
    // Dynamic (0x2b): a Dynamic nested inside a Dynamic. The header is a single
    // max_dynamic_types byte; the value is itself a type-encoding + value, so it
    // is just a recursive readDynamic. We skip max_dynamic_types because it does
    // NOT affect value decoding — it is a storage/Native-format overflow
    // threshold; in RowBinary every value is normalized to a plain (tag, value).
    case 0x2b:
      readUInt8(state); // max_dynamic_types — storage threshold, not used to decode
      return readDynamic;
    // Custom type (0x2c): the type name is written as a String and must be
    // re-parsed to learn the real type — we don't have a type-name parser.
    case 0x2c:
      throw new RangeError(
        "RowBinary: Dynamic type 0x2c (custom type, name-encoded) is not supported — requires parsing the type name string",
      );
    case 0x2d:
      return readBool;
    // SimpleAggregateFunction (0x2e): transparent — the value is just its
    // underlying type T. The header is (function_name String, argument types);
    // extend here by consuming those, then returning T's reader.
    case 0x2e:
      throw new RangeError(
        "RowBinary: Dynamic type 0x2e (SimpleAggregateFunction) is not supported yet — consume the header, then read the inner T",
      );
    // Nested(...) (0x2f): on the wire it IS Array(Tuple(...)). The header is
    // identical to a named Tuple's (count, then (name String, type) pairs), and
    // the value is an Array of those tuples, so compose readArray + readTupleNamed.
    case 0x2f: {
      const n = readUVarint(state);
      const fields: Record<string, Reader<unknown>> = {};
      for (let i = 0; i < n; i++) {
        const name = readString(state);
        fields[name] = readDynamicType(state);
      }
      return readArray(readTupleNamed(fields));
    }
    // JSON (0x30): the type-encoding header is a version byte, max_dynamic_paths
    // (varuint), max_dynamic_types (uint8), then the typed-path / skip-path /
    // skip-regexp lists. We consume it to reach the value body. Typed paths are
    // serialized WITHOUT a Dynamic tag, so a schema-less reader can't decode them
    // — bail if any are declared.
    case 0x30: {
      readUInt8(state); // serialization version (observed 0x00)
      readUVarint(state); // max_dynamic_paths
      readUInt8(state); // max_dynamic_types
      const typedPaths = readUVarint(state);
      if (typedPaths !== 0) {
        throw new RangeError(
          "RowBinary: JSON with declared typed paths is not supported — read each typed path with its known type",
        );
      }
      const skipPaths = readUVarint(state);
      for (let i = 0; i < skipPaths; i++) readString(state);
      const skipRegexps = readUVarint(state);
      for (let i = 0; i < skipRegexps; i++) readString(state);
      return readJSON;
    }
    default:
      throw new RangeError(
        `RowBinary: unknown Dynamic type tag 0x${tag.toString(16)} (not in the binary type encoding table)`,
      );
  }
}
