import { bench, describe } from "vitest";
import { query } from "./clickhouse.js";
import { type Reader, Cursor } from "../src/readers/core.js";
import { type DecimalValue, formatDecimal } from "../src/readers/decimals.js";
import {
  type LedgerRow,
  readLedgerRow,
  readLedgerRowFast,
} from "../src/examples/ledger.js";

/**
 * Benchmark + correctness proof: RowBinary vs JSON for a financial ledger whose
 * every column is WIDER than a JS `number` can hold — `UInt128`, `Int64`,
 * `Decimal128(18)`, `UInt256`. The SKILL says RowBinary "clearly wins" on wide
 * numerics; here it wins twice over, because for this shape JSON isn't just
 * slower, it's WRONG:
 *
 *   - ClickHouse emits these as BARE JSON numbers, so stock `JSON.parse` rounds
 *     every one to a float64 — silent, lossy corruption (demonstrated below).
 *   - The only correct JSON path quotes the values server-side
 *     (`output_format_json_quote_64bit_integers` + `..._quote_decimals`) and
 *     re-parses each string into a `bigint`/decimal pair by hand — extra work on
 *     top of a larger wire.
 *
 * RowBinary reads each value as an exact `bigint` straight off the wire.
 */
const N = 50_000;

const SELECT =
  `SELECT ` +
  // UInt128 near the top of the range, varied per row.
  `toUInt128('340282366920938463463374607431768200000') + number AS txn_id, ` +
  // Int64 starting at 2^53 + 1 — already past exact-double range on row 0.
  `toInt64(9007199254740993) + number AS account, ` +
  // Decimal128(18): ~14 integer digits + 18 fractional = 32 significant digits.
  `CAST(concat(toString(toUInt64(98765432109876 + number)), '.123456789012345678') AS Decimal128(18)) AS amount, ` +
  `CAST(concat(toString(toUInt64(12345678901234 + number)), '.111111111111111111') AS Decimal128(18)) AS balance, ` +
  `CAST(concat(toString(toUInt64(1000 + number % 9000)), '.5678') AS Decimal64(4)) AS fee, ` +
  // UInt256 near the top of the range.
  `toUInt256('115792089237316195423570985008687907853269984665640564039457000000000') + number AS volume ` +
  `FROM numbers(${N})`;

const RB_BUF = await query(`${SELECT} FORMAT RowBinary`);
// Naive JSON: bare numbers. Fast to parse, but every wide value is corrupted.
const JSON_BARE_BUF = await query(`${SELECT} FORMAT JSONEachRow`);
// Correct JSON: quote wide ints AND decimals so values arrive as exact strings.
const QUOTE =
  "SETTINGS output_format_json_quote_64bit_integers = 1, output_format_json_quote_decimals = 1";
const JSON_STR_BUF = await query(`${SELECT} ${QUOTE} FORMAT JSONEachRow`);
const JSON_COMPACT_STR_BUF = await query(
  `${SELECT} ${QUOTE} FORMAT JSONCompactEachRow`,
);

// --- decoders ---------------------------------------------------------------

function decodeRowBinary(read: Reader<LedgerRow>): LedgerRow[] {
  const s = new Cursor(RB_BUF);
  const out: LedgerRow[] = [];
  while (s.pos < s.buf.length) out.push(read(s));
  return out;
}

function jsonArray(buf: Buffer): unknown[] {
  return JSON.parse(
    `[${buf.toString("utf8").trimEnd().replaceAll("\n", ",")}]`,
  );
}

// Parse a fixed-point decimal string ("123.456") into the exact [unscaled, scale]
// pair RowBinary returns — the per-field work JSON must do to stay lossless.
function parseDecimal(str: string, scale: number): DecimalValue {
  const neg = str.charCodeAt(0) === 45; // '-'
  const s = neg ? str.slice(1) : str;
  const dot = s.indexOf(".");
  let digits: string;
  let frac: number;
  if (dot === -1) {
    digits = s;
    frac = 0;
  } else {
    digits = s.slice(0, dot) + s.slice(dot + 1);
    frac = s.length - dot - 1;
  }
  let unscaled = BigInt(digits);
  if (frac < scale) unscaled *= 10n ** BigInt(scale - frac);
  else if (frac > scale) unscaled /= 10n ** BigInt(frac - scale);
  return [neg ? -unscaled : unscaled, scale];
}

// Correct decode of the quoted JSON: turn the string fields back into the exact
// bigint / decimal-pair shape RowBinary produces.
function decodeJsonObjectsCorrect(buf: Buffer): LedgerRow[] {
  const rows = jsonArray(buf) as Record<string, string>[];
  const out: LedgerRow[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    out[i] = {
      txn_id: BigInt(r.txn_id!),
      account: BigInt(r.account!),
      amount: parseDecimal(r.amount!, 18),
      balance: parseDecimal(r.balance!, 18),
      fee: parseDecimal(r.fee!, 4),
      volume: BigInt(r.volume!),
    };
  }
  return out;
}

function decodeJsonCompactCorrect(buf: Buffer): LedgerRow[] {
  const rows = jsonArray(buf) as string[][];
  const out: LedgerRow[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    out[i] = {
      txn_id: BigInt(r[0]!),
      account: BigInt(r[1]!),
      amount: parseDecimal(r[2]!, 18),
      balance: parseDecimal(r[3]!, 18),
      fee: parseDecimal(r[4]!, 4),
      volume: BigInt(r[5]!),
    };
  }
  return out;
}

// --- correctness cross-check + the corruption demonstration (runs at load) ---

const eqDec = (a: DecimalValue, b: DecimalValue) =>
  a[0] === b[0] && a[1] === b[1];
const eqRow = (a: LedgerRow, b: LedgerRow) =>
  a.txn_id === b.txn_id &&
  a.account === b.account &&
  eqDec(a.amount, b.amount) &&
  eqDec(a.balance, b.balance) &&
  eqDec(a.fee, b.fee) &&
  a.volume === b.volume;

{
  const rb = decodeRowBinary(readLedgerRowFast);
  const api = decodeRowBinary(readLedgerRow);
  const jObj = decodeJsonObjectsCorrect(JSON_STR_BUF);
  const jCompact = decodeJsonCompactCorrect(JSON_COMPACT_STR_BUF);
  const bare = jsonArray(JSON_BARE_BUF) as Record<string, number>[]; // the WRONG path

  if (rb.length !== N)
    throw new Error(`RowBinary: ${rb.length} rows, expected ${N}`);
  for (let i = 0; i < N; i++) {
    if (!eqRow(rb[i]!, api[i]!))
      throw new Error(`ledger: API vs fast mismatch @${i}`);
    if (!eqRow(rb[i]!, jObj[i]!))
      throw new Error(`ledger: RowBinary vs quoted-JSON mismatch @${i}`);
    if (!eqRow(rb[i]!, jCompact[i]!))
      throw new Error(`ledger: RowBinary vs quoted-compact mismatch @${i}`);
  }

  // The corruption: stock JSON.parse over the BARE numbers disagrees with the
  // exact RowBinary value on every wide column of row 0.
  const r0 = rb[0]!;
  const b0 = bare[0]!;
  console.log(
    `\n  Financial ledger — ${N.toLocaleString()} rows. Stock JSON.parse on bare numbers (row 0):\n` +
      `    txn_id  RowBinary ${r0.txn_id}\n` +
      `            JSON.parse ${BigInt(Math.trunc(b0.txn_id as unknown as number)).toString()}   ${BigInt(Math.trunc(b0.txn_id as unknown as number)) === r0.txn_id ? "ok" : "✗ CORRUPTED"}\n` +
      `    account RowBinary ${r0.account}\n` +
      `            JSON.parse ${b0.account}   ${BigInt(b0.account!) === r0.account ? "ok" : "✗ CORRUPTED"}\n` +
      `    amount  RowBinary ${formatDecimal(r0.amount)}\n` +
      `            JSON.parse ${b0.amount}   ✗ CORRUPTED (only ~16 sig digits survive)\n`,
  );

  const mb = (b: Buffer) => (b.length / 1e6).toFixed(2);
  const x = (b: Buffer) => `${(b.length / RB_BUF.length).toFixed(1)}x`;
  console.log(
    `  Wire size (correct paths quote wide values as strings):\n` +
      `    RowBinary                  ${mb(RB_BUF)} MB\n` +
      `    JSONCompactEachRow quoted  ${mb(JSON_COMPACT_STR_BUF)} MB  ${x(JSON_COMPACT_STR_BUF)}\n` +
      `    JSONEachRow quoted         ${mb(JSON_STR_BUF)} MB  ${x(JSON_STR_BUF)}\n`,
  );
}

// --- benchmarks -------------------------------------------------------------

describe("Financial ledger: RowBinary vs JSON decode throughput", () => {
  bench("RowBinary — optimized (monomorphized)", () => {
    decodeRowBinary(readLedgerRowFast);
  });
  bench("RowBinary — API (combinators)", () => {
    decodeRowBinary(readLedgerRow);
  });
  bench(
    "JSONCompactEachRow quoted — JSON.parse + BigInt/decimal (correct)",
    () => {
      decodeJsonCompactCorrect(JSON_COMPACT_STR_BUF);
    },
  );
  bench("JSONEachRow quoted — JSON.parse + BigInt/decimal (correct)", () => {
    decodeJsonObjectsCorrect(JSON_STR_BUF);
  });
  bench("JSONEachRow bare — JSON.parse only (FAST BUT WRONG)", () => {
    jsonArray(JSON_BARE_BUF);
  });
});
