/**
 * Barrel re-export of the RowBinary reader, split by type family into the
 * sibling modules. Import from here for everything in one place, or from a
 * specific module (e.g. `./integers.js`, `./strings.js`) to pull in only the
 * sub-parsers a given result actually needs — the latter is what a generated
 * parser should do, copying just the modules its column types require.
 *
 * - core      — Cursor, Reader<T>, advance, NeedMoreData
 * - varint    — readUVarint
 * - integers  — readUInt8..readUInt256, readInt8..readInt256
 * - bool / enums / floats
 * - decimals  — DecimalValue, formatDecimal, readDecimal32..256
 * - strings   — readString, readFixedString, readFixedStringBytes
 * - uuid      — readUUID(+BigInt/HiLo), formatUUID(+Table)
 * - ip        — readIPv4/6, formatIPv4/6
 * - datetime / time / interval
 * - composite — readArray/Map/Tuple/TupleNamed/Nullable/Variant/QBit
 * - rows      — readRows
 * - geo       — Point, readPoint/Ring/LineString/Polygon/MultiLineString/MultiPolygon/Geometry
 * - dynamic   — readDynamic, readDynamicType
 * - json      — readJSON
 * - stream    — streamRowBatches, coalesceChunks
 * - transparent / special wrappers (mostly documentation; see each file):
 *   lowCardinality (readLowCardinality), simpleAggregateFunction
 *   (readSimpleAggregateFunction), nested (readNested), nothing (readNothing),
 *   aggregateFunction (readAggregateFunction)
 *
 * Runtime schema path — compile a reader from the type STRINGS rather than
 * hand-/code-generating one. Use this when the column types are not known until
 * the response arrives (or you just want a generic decoder); for a fixed,
 * known schema the specialized straight-line reader is faster.
 * - header   — readHeader: the RowBinaryWithNamesAndTypes preamble (column
 *              names + type strings) off the cursor
 * - compile  — astToReader: fold one parsed type AST (from
 *              `@clickhouse/datatype-parser`) into a value Reader. AST in,
 *              reader out — the type-to-combinator mapping, nothing else
 * - rowBinaryWithNamesAndTypes — typeStringToReader (parse a type string +
 *              fold) and compileRowBinaryWithNamesAndTypes (read the header,
 *              compile every column, return a `readRows` driver for the rest of
 *              the stream): the end-to-end runtime entry point
 */
export * from "./core.js";
export * from "./varint.js";
export * from "./integers.js";
export * from "./bool.js";
export * from "./enums.js";
export * from "./floats.js";
export * from "./decimals.js";
export * from "./strings.js";
export * from "./uuid.js";
export * from "./ip.js";
export * from "./datetime.js";
export * from "./time.js";
export * from "./interval.js";
export * from "./composite.js";
export * from "./rows.js";
export * from "./geo.js";
export * from "./dynamic.js";
export * from "./json.js";
export * from "./stream.js";
export * from "./lowCardinality.js";
export * from "./simpleAggregateFunction.js";
export * from "./nested.js";
export * from "./nothing.js";
export * from "./aggregateFunction.js";
export * from "./header.js";
export * from "./compile.js";
export * from "./rowBinaryWithNamesAndTypes.js";
