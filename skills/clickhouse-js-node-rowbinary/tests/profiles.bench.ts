import { bench, describe } from "vitest";
import { query } from "./clickhouse.js";
import { type Reader, Cursor } from "../src/readers/core.js";
import {
  type ProfileRow,
  readProfileRow,
  readProfileRowFast,
} from "../src/examples/profiles.js";

/**
 * Benchmark: API-combinator `readProfileRow` vs monomorphized
 * `readProfileRowFast` over the same large buffer. This is the first case where
 * the API version allocates a combinator closure per row (`readArray(readString)`
 * and `readNullable(readInt32)`), so the inlined version should pull ahead.
 */
const N = 20_000;
const BUF = await query(
  `SELECT toUInt32(number) AS id, ` +
    `arrayMap(x -> concat('t', toString(x)), range(number % 4)) AS tags, ` +
    `CAST(if(number % 3 = 0, NULL, toInt32(number) - 50) AS Nullable(Int32)) AS score ` +
    `FROM numbers(${N}) FORMAT RowBinary`,
);

function decodeAll(read: Reader<ProfileRow>): ProfileRow[] {
  const s = new Cursor(BUF);
  const out: ProfileRow[] = [];
  while (s.pos < s.buf.length) out.push(read(s));
  return out;
}

const norm = (rows: ProfileRow[]): string => JSON.stringify(rows);
{
  const a = decodeAll(readProfileRow);
  const b = decodeAll(readProfileRowFast);
  if (a.length !== N)
    throw new Error(`profiles: decoded ${a.length} rows, expected ${N}`);
  if (norm(a) !== norm(b)) throw new Error("profiles: API vs fast mismatch");
}

describe("example profiles: API vs optimized", () => {
  bench("API (combinators)", () => {
    decodeAll(readProfileRow);
  });
  bench("optimized (monomorphized)", () => {
    decodeAll(readProfileRowFast);
  });
});
