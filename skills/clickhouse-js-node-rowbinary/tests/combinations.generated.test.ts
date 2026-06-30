import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import {
  readArray,
  readMap,
  readNullable,
  readTuple,
  readVariant,
} from "../src/readers/composite.js";
import { NeedMoreData, type Reader, Cursor } from "../src/readers/core.js";
import { readInt32, readUInt8 } from "../src/readers/integers.js";
import { readString } from "../src/readers/strings.js";

/**
 * GENERATED type-combination coverage — the systematic companion to the curated,
 * hand-written cases in `framing-nested.test.ts`.
 *
 * The bug surface for composite readers is boundary DESYNC: an inner reader
 * miscounts its bytes and silently shifts everything after it. The space of
 * nestings (every combinator wrapping every inner, at every depth, with every
 * edge payload) is exponential, so we don't take the Cartesian product.
 *
 * Instead, following the "one-leaf-at-a-time" strategy from
 * type-predicate-generator issue #18: build small case generators that compose
 * like the readers do, then vary ONE position at a time — each combinator is
 * shown wrapping each *category* of inner (fixed-width / variable-length /
 * nullable / NULL / self-describing / composite) plus the bug-prone edge
 * payloads (empty string, zero, empty array, NULL-flag-only). That turns N^M into
 * ~combinators x categories while still exercising each edge IN a nesting
 * context. ClickHouse is the byte oracle — a case only declares its SQL
 * expression and expected JS value; the server produces the bytes.
 *
 * Each case is checked two ways:
 *   1. FRAMED `i32(LEAD), X, i32(TRAIL)` — reading TRAIL back is only possible if
 *      X consumed EXACTLY its bytes (same harness as framing-nested.test.ts).
 *   2. TRUNCATION SWEEP — every incomplete prefix `0 .. full.length-1` must throw
 *      `NeedMoreData` (generalizes Array.test.ts's prefix sweep to the whole
 *      matrix, covering the streaming/`advance()` half of the bug surface).
 */

const LEAD = 123456789;
const TRAIL = 987654321;

const SETTINGS = [
  "enable_time_time64_type = 1",
  "allow_experimental_variant_type = 1",
  "allow_suspicious_variant_types = 1",
  "allow_experimental_dynamic_type = 1",
  "allow_experimental_json_type = 1",
  "enable_json_type = 1",
  "allow_experimental_qbit_type = 1",
  "allow_suspicious_low_cardinality_types = 1",
].join(", ");

/**
 * One self-checking node of a generated case. `expr` is a fully type-annotated
 * ClickHouse expression (every level casts, so server-side type inference is
 * never ambiguous); `read` decodes it; `expected` is the decoded JS value.
 * The flags gate which outer combinators may legally wrap this node.
 */
type Gen = {
  type: string;
  expr: string;
  read: Reader<unknown>;
  expected: unknown;
  label: string;
  /** plain scalar — the only thing `Nullable(...)` is allowed to wrap */
  leaf: boolean;
  /** already a `Nullable` — can't be re-wrapped by Nullable or put in a Variant */
  nullableRoot: boolean;
  /** already a `Variant` — can't be an alternative of another Variant */
  variantRoot: boolean;
};

// ---- leaf generators: the white-box edge set, not arbitrary values ----------

const u8 = (n: number): Gen => ({
  type: "UInt8",
  expr: `${n}::UInt8`,
  read: readUInt8,
  expected: n,
  label: `u8=${n}`,
  leaf: true,
  nullableRoot: false,
  variantRoot: false,
});

const str = (s: string): Gen => ({
  type: "String",
  expr: `'${s}'::String`,
  read: readString,
  expected: s,
  label: s === "" ? "str=''" : `str='${s}'`,
  leaf: true,
  nullableRoot: false,
  variantRoot: false,
});

// ---- combinator generators: compose like the readers do ---------------------

const nullablePresent = (inner: Gen): Gen => ({
  type: `Nullable(${inner.type})`,
  expr: `${inner.expr}::Nullable(${inner.type})`,
  read: readNullable(inner.read),
  expected: inner.expected,
  label: `Nullable(${inner.label})`,
  leaf: false,
  nullableRoot: true,
  variantRoot: false,
});

const nullValue = (inner: Gen): Gen => ({
  type: `Nullable(${inner.type})`,
  expr: `NULL::Nullable(${inner.type})`,
  read: readNullable(inner.read),
  expected: null,
  label: `Nullable(${inner.label})=NULL`,
  leaf: false,
  nullableRoot: true,
  variantRoot: false,
});

const array = (inner: Gen, n: number): Gen => {
  const elems = Array.from({ length: n }, () => inner.expr);
  return {
    type: `Array(${inner.type})`,
    expr: `[${elems.join(", ")}]::Array(${inner.type})`,
    read: readArray(inner.read),
    expected: Array.from({ length: n }, () => inner.expected),
    label: `Array[len=${n}](${inner.label})`,
    leaf: false,
    nullableRoot: false,
    variantRoot: false,
  };
};

const tuple2 = (a: Gen, b: Gen): Gen => ({
  type: `Tuple(${a.type}, ${b.type})`,
  expr: `(${a.expr}, ${b.expr})::Tuple(${a.type}, ${b.type})`,
  read: readTuple([a.read, b.read]),
  expected: [a.expected, b.expected],
  label: `Tuple(${a.label}, ${b.label})`,
  leaf: false,
  nullableRoot: false,
  variantRoot: false,
});

const map = (key: Gen, value: Gen): Gen => ({
  type: `Map(${key.type}, ${value.type})`,
  expr: `map(${key.expr}, ${value.expr})::Map(${key.type}, ${value.type})`,
  read: readMap(key.read, value.read),
  expected: new Map([[key.expected, value.expected]]),
  label: `Map(${key.label} => ${value.label})`,
  leaf: false,
  nullableRoot: false,
  variantRoot: false,
});

/**
 * Hold `chosen` inside a `Variant(chosen, marker)`. ClickHouse sorts alternatives
 * by type NAME and the discriminant indexes that sorted order, so the reader list
 * must be sorted the same way (see `readVariant`'s gotcha).
 */
const variantHolding = (chosen: Gen, marker: Gen): Gen => {
  const sorted = [chosen, marker].sort((x, y) => (x.type < y.type ? -1 : 1));
  const type = `Variant(${sorted.map((g) => g.type).join(", ")})`;
  return {
    type,
    expr: `${chosen.expr}::${type}`,
    read: readVariant(sorted.map((g) => g.read)),
    expected: chosen.expected,
    label: `Variant<${chosen.label}>`,
    leaf: false,
    nullableRoot: false,
    variantRoot: true,
  };
};

// ---- the matrix: combinators (rows) x inner categories (columns) ------------

const INNERS: Gen[] = [
  u8(1), // fixed-width
  u8(0), // edge: zero
  str("hi"), // variable-length
  str(""), // edge: empty string
  nullablePresent(u8(1)), // nullable, present
  nullValue(u8(1)), // edge: NULL flag only
  variantHolding(str("hi"), u8(7)), // self-describing
  array(u8(1), 2), // composite -> drives depth-2 nesting
];

// A distinct-typed Variant marker so the two alternatives never collide.
const markerFor = (inner: Gen): Gen =>
  inner.type === "String" ? u8(7) : str("zz");

const COMBINATORS: Array<{
  label: string;
  accepts: (inner: Gen) => boolean;
  build: (inner: Gen) => Gen;
}> = [
  {
    label: "Array(len=0)", // edge: count byte only, inner never read
    accepts: () => true,
    build: (inner) => array(inner, 0),
  },
  {
    label: "Array(len=2)",
    accepts: () => true,
    build: (inner) => array(inner, 2),
  },
  {
    label: "Nullable", // only legal around a plain scalar
    accepts: (inner) => inner.leaf,
    build: (inner) => nullablePresent(inner),
  },
  {
    label: "Tuple2", // inner adjacent to a fixed sibling
    accepts: () => true,
    build: (inner) => tuple2(inner, u8(1)),
  },
  {
    label: "Map(String,_)",
    accepts: () => true,
    build: (inner) => map(str("k"), inner),
  },
  {
    label: "Variant", // can't wrap a Nullable or another Variant
    accepts: (inner) => !inner.nullableRoot && !inner.variantRoot,
    build: (inner) => variantHolding(inner, markerFor(inner)),
  },
];

const cases: Gen[] = [];
const skipped: string[] = [];
for (const comb of COMBINATORS) {
  for (const inner of INNERS) {
    if (comb.accepts(inner)) {
      cases.push({
        ...comb.build(inner),
        label: `${comb.label} / ${inner.label}`,
      });
    } else {
      skipped.push(`${comb.label} / ${inner.label}`);
    }
  }
}

async function framedBytes(expr: string): Promise<Buffer> {
  const sql =
    `SELECT toInt32(${LEAD}) AS a, ${expr} AS x, toInt32(${TRAIL}) AS b` +
    ` SETTINGS ${SETTINGS} FORMAT RowBinary`;
  return query(sql);
}

describe("type combinations (generated, one-leaf-at-a-time)", () => {
  for (const c of cases) {
    it(c.label, async () => {
      const full = await framedBytes(c.expr);

      // 1. framed: decodes correctly AND consumes exactly its bytes.
      const r = new Cursor(full);
      expect(readInt32(r)).toBe(LEAD);
      expect(c.read(r)).toEqual(c.expected);
      expect(readInt32(r), `${c.label}: x over/under-read`).toBe(TRAIL);

      // 2. truncation sweep: every incomplete prefix must starve, never desync.
      for (let len = 0; len < full.length; len++) {
        const p = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readInt32(p);
          c.read(p);
          readInt32(p);
        } catch (e) {
          thrown = e;
        }
        expect(thrown, `${c.label}: prefix ${len}/${full.length}`).toBe(
          NeedMoreData,
        );
      }
    });
  }

  // No silent caps: lock the skip list so an accidental new gap fails the test.
  it("skips only the type-system-illegal combinations", () => {
    expect(skipped.sort()).toEqual(
      [
        "Nullable / Array[len=2](u8=1)",
        "Nullable / Nullable(u8=1)",
        "Nullable / Nullable(u8=1)=NULL",
        "Nullable / Variant<str='hi'>",
        "Variant / Nullable(u8=1)",
        "Variant / Nullable(u8=1)=NULL",
        "Variant / Variant<str='hi'>",
      ].sort(),
    );
  });
});
