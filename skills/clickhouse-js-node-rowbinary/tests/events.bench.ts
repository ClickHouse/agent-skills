import { bench, describe } from "vitest";
import { query } from "./clickhouse.js";
import { type Reader, Cursor } from "../src/readers/core.js";
import {
  type EventRow,
  readEventRow,
  readEventRowFast,
} from "../src/examples/events.js";

/**
 * Benchmark: the API-combinator `readEventRow` vs the inlined `readEventRowFast`,
 * both decoding the SAME large `FORMAT RowBinary` buffer (N rows from numbers()).
 * Each `bench` op decodes the whole buffer, so the number is rows/iteration; the
 * ratio between the two contenders is the takeaway. Equivalence is checked once
 * before timing — a faster wrong answer is worthless.
 */
const N = 20_000;
const BUF = await query(
  `SELECT toUInt64(number) AS id, concat('name', toString(number)) AS name, ` +
    `toDateTime('2021-01-01 00:00:00', 'UTC') + number AS ts ` +
    `FROM numbers(${N}) FORMAT RowBinary`,
);

function decodeAll(read: Reader<EventRow>): EventRow[] {
  const s = new Cursor(BUF);
  const out: EventRow[] = [];
  while (s.pos < s.buf.length) out.push(read(s));
  return out;
}

const norm = (rows: EventRow[]): string =>
  JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? `${v}n` : v));
{
  const a = decodeAll(readEventRow);
  const b = decodeAll(readEventRowFast);
  if (a.length !== N)
    throw new Error(`events: decoded ${a.length} rows, expected ${N}`);
  if (norm(a) !== norm(b)) throw new Error("events: API vs fast mismatch");
}

describe("example events: API vs optimized", () => {
  bench("API (combinators)", () => {
    decodeAll(readEventRow);
  });
  bench("optimized (inlined)", () => {
    decodeAll(readEventRowFast);
  });
});
