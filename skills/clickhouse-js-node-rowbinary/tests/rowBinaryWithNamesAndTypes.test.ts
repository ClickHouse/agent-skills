import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import {
  compileRowBinaryWithNamesAndTypes,
  createTypeReaderCache,
  typeStringToReader,
  type Row,
} from "../src/readers/rowBinaryWithNamesAndTypes.js";
import { RowBinaryTypeError } from "../src/readers/compile.js";

/** Raw value bytes for one expression (`FORMAT RowBinary`, no header). */
async function rowBinary(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} FORMAT RowBinary`));
}

/** A full `RowBinaryWithNamesAndTypes` response (header + rows) as a cursor. */
async function withNamesAndTypes(select: string): Promise<Cursor> {
  return new Cursor(await query(`${select} FORMAT RowBinaryWithNamesAndTypes`));
}

/**
 * Compile a `SELECT ... FORMAT RowBinaryWithNamesAndTypes` response and decode
 * every row. Asserts the stream is consumed EXACTLY — the strongest single
 * check that the fold picked the right reader for each column and framed the
 * bytes correctly. Returns the header type strings and the decoded rows.
 */
async function decode(
  select: string,
): Promise<{ types: string[]; rows: Row[] }> {
  const s = await withNamesAndTypes(select);
  const compiled = compileRowBinaryWithNamesAndTypes(s);
  const rows = compiled.readRows(s);
  expect(s.pos).toBe(s.buf.length); // consumed exactly — no under/over-read
  return { types: compiled.types, rows };
}

/** Decode a single-column, single-row `... AS v` SELECT down to its value. */
async function value(select: string): Promise<unknown> {
  const { rows } = await decode(select);
  expect(rows).toHaveLength(1);
  return rows[0]!.v;
}

describe("typeStringToReader (AST -> combinator fold)", () => {
  it("folds a nested composite type into a working reader", async () => {
    const s = await rowBinary("CAST([1, NULL, 3] AS Array(Nullable(UInt32)))");
    expect(typeStringToReader("Array(Nullable(UInt32))")(s)).toEqual([
      1,
      null,
      3,
    ]);
  });

  it("throws a typed RowBinaryTypeError (with typeString + position) for an unsupported type", () => {
    const type = "AggregateFunction(sum, UInt64)";
    let err: unknown;
    try {
      typeStringToReader(type);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RowBinaryTypeError);
    const typed = err as RowBinaryTypeError;
    expect(typed.message).toMatch(/cannot compile type/);
    expect(typed.typeString).toBe(type);
    expect(typeof typed.position).toBe("number");
  });
});

// The corpus below mirrors the parser's test/cases.txt, one it() per type or
// combination. Each value is the actual decode of a server-produced stream.
describe("scalars", () => {
  it("UInt8", async () => {
    expect(await value("SELECT toUInt8(255) AS v")).toEqual(255);
  });
  it("UInt16", async () => {
    expect(await value("SELECT toUInt16(65535) AS v")).toEqual(65535);
  });
  it("UInt32", async () => {
    expect(await value("SELECT toUInt32(4294967295) AS v")).toEqual(4294967295);
  });
  it("UInt64", async () => {
    expect(await value("SELECT toUInt64('18446744073709551615') AS v")).toEqual(
      18446744073709551615n,
    );
  });
  it("UInt128", async () => {
    expect(
      await value(
        "SELECT toUInt128('340282366920938463463374607431768211455') AS v",
      ),
    ).toEqual(340282366920938463463374607431768211455n);
  });
  it("UInt256", async () => {
    expect(
      await value("SELECT toUInt256('123456789012345678901234567890') AS v"),
    ).toEqual(123456789012345678901234567890n);
  });
  it("Int8", async () => {
    expect(await value("SELECT toInt8(-128) AS v")).toEqual(-128);
  });
  it("Int16", async () => {
    expect(await value("SELECT toInt16(-32768) AS v")).toEqual(-32768);
  });
  it("Int32", async () => {
    expect(await value("SELECT toInt32(-2147483648) AS v")).toEqual(
      -2147483648,
    );
  });
  it("Int64", async () => {
    expect(await value("SELECT toInt64('-9223372036854775808') AS v")).toEqual(
      -9223372036854775808n,
    );
  });
  it("Int128", async () => {
    expect(
      await value(
        "SELECT toInt128('-170141183460469231731687303715884105728') AS v",
      ),
    ).toEqual(-170141183460469231731687303715884105728n);
  });
  it("Int256", async () => {
    expect(
      await value("SELECT toInt256('-123456789012345678901234567890') AS v"),
    ).toEqual(-123456789012345678901234567890n);
  });
  it("Float32", async () => {
    expect(await value("SELECT toFloat32(1.5) AS v")).toEqual(1.5);
  });
  it("Float64", async () => {
    expect(await value("SELECT toFloat64(1.5) AS v")).toEqual(1.5);
  });
  it("BFloat16", async () => {
    expect(await value("SELECT CAST(1.5 AS BFloat16) AS v")).toEqual(1.5);
  });
  it("Bool", async () => {
    expect(await value("SELECT true AS v")).toEqual(true);
  });
  it("String", async () => {
    expect(await value("SELECT 'hello' AS v")).toEqual("hello");
  });
  it("FixedString(N)", async () => {
    expect(await value("SELECT CAST('abcde' AS FixedString(5)) AS v")).toEqual(
      "abcde",
    );
  });
  it("UUID", async () => {
    expect(
      await value("SELECT toUUID('61f0c404-5cb3-11e7-907b-a6006ad3dba0') AS v"),
    ).toEqual(
      Buffer.from([
        231, 17, 179, 92, 4, 196, 240, 97, 160, 219, 211, 106, 0, 166, 123, 144,
      ]),
    );
  });
  it("IPv4", async () => {
    expect(await value("SELECT toIPv4('1.2.3.4') AS v")).toEqual(16909060);
  });
  it("IPv6", async () => {
    expect(await value("SELECT toIPv6('2001:db8::1') AS v")).toEqual(
      Buffer.from([32, 1, 13, 184, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
    );
  });
  it("Date", async () => {
    expect(await value("SELECT toDate('2020-01-02') AS v")).toEqual(
      new Date(1577923200000),
    );
  });
  it("Date32", async () => {
    expect(await value("SELECT toDate32('2020-01-02') AS v")).toEqual(
      new Date(1577923200000),
    );
  });
  it("DateTime", async () => {
    expect(
      await value("SELECT toDateTime('2020-01-02 03:04:05', 'UTC') AS v"),
    ).toEqual(new Date(1577934245000));
  });
  it("DateTime64(3) -> [Date, nanoseconds]", async () => {
    expect(
      await value(
        "SELECT toDateTime64('2020-01-02 03:04:05.123', 3, 'UTC') AS v",
      ),
    ).toEqual([new Date(1577934245000), 123000000]);
  });
  it("DateTime64(9) -> [Date, nanoseconds]", async () => {
    expect(
      await value(
        "SELECT toDateTime64('2020-01-02 03:04:05.123456789', 9, 'UTC') AS v",
      ),
    ).toEqual([new Date(1577934245000), 123456789]);
  });
  it("Time -> seconds", async () => {
    expect(
      await value(
        "SELECT CAST(3661 AS Time) AS v SETTINGS enable_time_time64_type=1",
      ),
    ).toEqual(3661);
  });
  it("Time64(3) -> [ticks, precision]", async () => {
    expect(
      await value(
        "SELECT CAST(3661.5 AS Time64(3)) AS v SETTINGS enable_time_time64_type=1",
      ),
    ).toEqual([3661500n, 3]);
  });
});

describe("decimals (width chosen by precision)", () => {
  it("Decimal(10, 2) -> Decimal32 width, [unscaled, scale]", async () => {
    const { types, rows } = await decode(
      "SELECT CAST(1.5 AS Decimal(10, 2)) AS v",
    );
    expect(types).toEqual(["Decimal(10, 2)"]);
    expect(rows[0]!.v).toEqual([150n, 2]);
  });
  it("Decimal(38, 10) -> Decimal128 width", async () => {
    expect(await value("SELECT CAST(1.5 AS Decimal(38, 10)) AS v")).toEqual([
      15000000000n,
      10,
    ]);
  });
  it("Decimal32(4) (header: Decimal(9, 4))", async () => {
    const { types, rows } = await decode(
      "SELECT CAST(1.5 AS Decimal32(4)) AS v",
    );
    expect(types).toEqual(["Decimal(9, 4)"]);
    expect(rows[0]!.v).toEqual([15000n, 4]);
  });
  it("Decimal64(4) (header: Decimal(18, 4))", async () => {
    expect(await value("SELECT CAST(1.5 AS Decimal64(4)) AS v")).toEqual([
      15000n,
      4,
    ]);
  });
  it("Decimal128(10) (header: Decimal(38, 10))", async () => {
    expect(await value("SELECT CAST(1.5 AS Decimal128(10)) AS v")).toEqual([
      15000000000n,
      10,
    ]);
  });
  it("Decimal256(20) (header: Decimal(76, 20))", async () => {
    expect(await value("SELECT CAST(1.5 AS Decimal256(20)) AS v")).toEqual([
      150000000000000000000n,
      20,
    ]);
  });
});

describe("enums (resolve to the value's name)", () => {
  it("Enum8", async () => {
    expect(
      await value("SELECT CAST('b' AS Enum8('a' = 1, 'b' = 2)) AS v"),
    ).toEqual("b");
  });
  it("Enum16", async () => {
    expect(
      await value("SELECT CAST('y' AS Enum16('x' = -1, 'y' = 100)) AS v"),
    ).toEqual("y");
  });
});

describe("intervals (count as bigint; unit lives in the type name)", () => {
  it("IntervalSecond", async () => {
    expect(await value("SELECT INTERVAL 5 SECOND AS v")).toEqual(5n);
  });
  it("IntervalDay", async () => {
    expect(await value("SELECT INTERVAL 3 DAY AS v")).toEqual(3n);
  });
});

describe("geo", () => {
  it("Point", async () => {
    expect(await value("SELECT CAST((1.5, 2.5) AS Point) AS v")).toEqual([
      1.5, 2.5,
    ]);
  });
  it("Ring", async () => {
    expect(
      await value("SELECT CAST([(0, 0), (1, 0), (1, 1)] AS Ring) AS v"),
    ).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
  });
  it("LineString", async () => {
    expect(
      await value("SELECT CAST([(0, 0), (1, 1)] AS LineString) AS v"),
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
  it("Polygon", async () => {
    expect(
      await value("SELECT CAST([[(0, 0), (1, 0), (1, 1)]] AS Polygon) AS v"),
    ).toEqual([
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    ]);
  });
  it("MultiLineString", async () => {
    expect(
      await value("SELECT CAST([[(0, 0), (1, 1)]] AS MultiLineString) AS v"),
    ).toEqual([
      [
        [0, 0],
        [1, 1],
      ],
    ]);
  });
  it("MultiPolygon", async () => {
    expect(
      await value(
        "SELECT CAST([[[(0, 0), (1, 0), (1, 1)]]] AS MultiPolygon) AS v",
      ),
    ).toEqual([
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      ],
    ]);
  });
});

describe("composites (recurse into element/key/field readers)", () => {
  it("Nullable(UInt64) — present", async () => {
    expect(await value("SELECT CAST(7 AS Nullable(UInt64)) AS v")).toEqual(7n);
  });
  it("Nullable(UInt64) — NULL", async () => {
    expect(await value("SELECT CAST(NULL AS Nullable(UInt64)) AS v")).toEqual(
      null,
    );
  });
  it("Array(String)", async () => {
    expect(
      await value("SELECT CAST(['a', 'bb'] AS Array(String)) AS v"),
    ).toEqual(["a", "bb"]);
  });
  it("Array(Array(Int32))", async () => {
    expect(
      await value("SELECT CAST([[1], [2, 3]] AS Array(Array(Int32))) AS v"),
    ).toEqual([[1], [2, 3]]);
  });
  it("Array(Nullable(UInt64))", async () => {
    expect(
      await value("SELECT CAST([1, NULL, 3] AS Array(Nullable(UInt64))) AS v"),
    ).toEqual([1n, null, 3n]);
  });
  it("Map(String, UInt64)", async () => {
    expect(
      await value(
        "SELECT CAST(map('a', 1, 'b', 2) AS Map(String, UInt64)) AS v",
      ),
    ).toEqual(
      new Map([
        ["a", 1n],
        ["b", 2n],
      ]),
    );
  });
  it("Map(String, Array(UInt8))", async () => {
    expect(
      await value(
        "SELECT CAST(map('a', [1, 2]) AS Map(String, Array(UInt8))) AS v",
      ),
    ).toEqual(new Map([["a", [1, 2]]]));
  });
  it("LowCardinality(String) — transparent", async () => {
    expect(
      await value("SELECT CAST('x' AS LowCardinality(String)) AS v"),
    ).toEqual("x");
  });
  it("LowCardinality(Nullable(String)) — NULL", async () => {
    expect(
      await value("SELECT CAST(NULL AS LowCardinality(Nullable(String))) AS v"),
    ).toEqual(null);
  });
  it("Array(Tuple(Float64, Float64))", async () => {
    expect(
      await value(
        "SELECT CAST([(1, 2), (3, 4)] AS Array(Tuple(Float64, Float64))) AS v",
      ),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
  it("Tuple(UInt8, String) — positional array", async () => {
    expect(
      await value("SELECT CAST((7, 'x') AS Tuple(UInt8, String)) AS v"),
    ).toEqual([7, "x"]);
  });
  it("Tuple(a UInt8, b String) — named object", async () => {
    expect(
      await value("SELECT CAST((7, 'x') AS Tuple(a UInt8, b String)) AS v"),
    ).toEqual({ a: 7, b: "x" });
  });
  it("Tuple(Decimal(10, 2), Nullable(String))", async () => {
    expect(
      await value(
        "SELECT CAST((1.5, NULL) AS Tuple(Decimal(10, 2), Nullable(String))) AS v",
      ),
    ).toEqual([[150n, 2], null]);
  });
  it("Nested(a UInt8, b String) — Array(Tuple) of objects", async () => {
    expect(
      await value(
        "SELECT CAST([(1, 'a'), (2, 'b')] AS Nested(a UInt8, b String)) AS v",
      ),
    ).toEqual([
      { a: 1, b: "a" },
      { a: 2, b: "b" },
    ]);
  });
  it("Variant(UInt8, String) — int alternative", async () => {
    expect(
      await value(
        "SELECT CAST(42 AS Variant(UInt8, String)) AS v SETTINGS allow_experimental_variant_type=1",
      ),
    ).toEqual(42);
  });
  it("Variant(UInt8, String) — string alternative", async () => {
    expect(
      await value(
        "SELECT CAST('hi' AS Variant(UInt8, String)) AS v SETTINGS allow_experimental_variant_type=1",
      ),
    ).toEqual("hi");
  });
});

describe("self-describing types", () => {
  it("Dynamic", async () => {
    expect(
      await value(
        "SELECT CAST(42 AS Dynamic) AS v SETTINGS allow_experimental_dynamic_type=1",
      ),
    ).toEqual(42);
  });
  it("JSON", async () => {
    expect(
      await value(
        `SELECT CAST('{"a":1}' AS JSON) AS v SETTINGS allow_experimental_json_type=1`,
      ),
    ).toEqual(new Map([["a", 1n]]));
  });
});

describe("SQL-standard aliases normalize to canonical types in the header", () => {
  it("DOUBLE PRECISION -> Float64", async () => {
    const { types, rows } = await decode(
      "SELECT CAST(1.5 AS DOUBLE PRECISION) AS v",
    );
    expect(types).toEqual(["Float64"]);
    expect(rows[0]!.v).toEqual(1.5);
  });
  it("REAL -> Float32", async () => {
    const { types } = await decode("SELECT CAST(1.5 AS REAL) AS v");
    expect(types).toEqual(["Float32"]);
  });
  it("VARCHAR -> String", async () => {
    const { types, rows } = await decode(
      "SELECT CAST('x' AS VARCHAR(10)) AS v",
    );
    expect(types).toEqual(["String"]);
    expect(rows[0]!.v).toEqual("x");
  });
  it("BIGINT -> Int64", async () => {
    const { types } = await decode("SELECT CAST(1 AS BIGINT) AS v");
    expect(types).toEqual(["Int64"]);
  });
  it("NUMERIC(10, 2) -> Decimal(10, 2)", async () => {
    const { types, rows } = await decode(
      "SELECT CAST(1.5 AS NUMERIC(10, 2)) AS v",
    );
    expect(types).toEqual(["Decimal(10, 2)"]);
    expect(rows[0]!.v).toEqual([150n, 2]);
  });
  it("BINARY(4) -> FixedString(4)", async () => {
    const { types, rows } = await decode(
      "SELECT CAST('abcd' AS BINARY(4)) AS v",
    );
    expect(types).toEqual(["FixedString(4)"]);
    expect(rows[0]!.v).toEqual("abcd");
  });
});

describe("compileRowBinaryWithNamesAndTypes", () => {
  it("compiles a header and decodes the rest of the stream into rows", async () => {
    const { names, types, rows } = await (async () => {
      const s = await withNamesAndTypes(`
        SELECT id, name, score FROM (
          SELECT toUInt32(1) AS id, CAST('alice' AS Nullable(String)) AS name, toFloat64(1.5) AS score
          UNION ALL
          SELECT toUInt32(2) AS id, CAST(NULL AS Nullable(String)) AS name, toFloat64(2.5) AS score
        ) ORDER BY id
      `);
      const compiled = compileRowBinaryWithNamesAndTypes(s);
      const decoded = compiled.readRows(s);
      expect(s.pos).toBe(s.buf.length);
      return { names: compiled.names, types: compiled.types, rows: decoded };
    })();

    expect(names).toEqual(["id", "name", "score"]);
    expect(types).toEqual(["UInt32", "Nullable(String)", "Float64"]);
    expect(rows).toEqual([
      { id: 1, name: "alice", score: 1.5 },
      { id: 2, name: null, score: 2.5 },
    ]);
  });

  it("handles a named Tuple and a Map column", async () => {
    const { rows } = await decode(`
      SELECT
        CAST((10, 20) AS Tuple(a UInt32, b UInt32)) AS pair,
        CAST(map('x', toUInt32(1), 'y', toUInt32(2)) AS Map(String, UInt32)) AS counts
    `);

    expect(rows).toHaveLength(1);
    // A named Tuple folds to readTupleNamed -> an object keyed by field name.
    expect(rows[0]!.pair).toEqual({ a: 10, b: 20 });
    expect(rows[0]!.counts).toEqual(
      new Map([
        ["x", 1],
        ["y", 2],
      ]),
    );
  });

  it("accepts a custom resolver (a shared reader cache)", async () => {
    const cache = createTypeReaderCache();
    let calls = 0;
    const resolve = (t: string) => {
      calls++;
      return cache(t);
    };

    const s = await withNamesAndTypes("SELECT toUInt32(1) AS id, 'x' AS name");
    const compiled = compileRowBinaryWithNamesAndTypes(s, resolve);
    expect(compiled.readRows(s)).toEqual([{ id: 1, name: "x" }]);
    expect(calls).toBe(2); // resolver consulted once per column
  });
});

describe("createTypeReaderCache (LRU, keyed by type string)", () => {
  it("returns the same reader instance for a repeated type, distinct for others", () => {
    const cache = createTypeReaderCache();
    const a = cache("Array(UInt8)");
    expect(cache("Array(UInt8)")).toBe(a); // hit -> same instance
    expect(cache("Array(UInt16)")).not.toBe(a); // different type -> different reader
  });

  it("evicts least-recently-used past maxSize, but a hit refreshes recency", () => {
    // Use composite types: each compile of e.g. `Array(UInt8)` allocates a FRESH
    // closure (readArray(...)), so instance identity actually reflects the cache.
    // (A nullary scalar like `UInt8` returns the shared module-level readUInt8
    // singleton every time, so it could never show an eviction.)
    const cache = createTypeReaderCache(2);
    const a1 = cache("Array(UInt8)"); //   [A8]
    const b1 = cache("Array(UInt16)"); //  [A8, A16]
    expect(cache("Array(UInt8)")).toBe(a1); // hit -> refresh -> [A16, A8]

    cache("Array(UInt32)"); // insert -> size 3 -> evict LRU (A16) -> [A8, A32]

    // Array(UInt8) was refreshed by the hit above, so it survived (same closure).
    expect(cache("Array(UInt8)")).toBe(a1);
    // Array(UInt16) was the least-recently-used, so it was evicted and now
    // recompiles to a DIFFERENT closure — this is what proves eviction happened.
    expect(cache("Array(UInt16)")).not.toBe(b1);
  });

  it("does not cache a parse failure", () => {
    const cache = createTypeReaderCache();
    expect(() => cache("AggregateFunction(sum, UInt64)")).toThrow(
      /cannot compile type/,
    );
    // A valid type still resolves afterwards (the failure left no poisoned entry).
    expect(typeof cache("UInt8")).toBe("function");
  });
});
