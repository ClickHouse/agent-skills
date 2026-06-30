import { type Reader, advance } from "../readers/core.js";
import {
  type DecimalValue,
  readDecimal64,
  readDecimal128,
} from "../readers/decimals.js";
import { readInt64, readUInt128, readUInt256 } from "../readers/integers.js";

/**
 * Example: a financial ledger — the WIDE-NUMERIC case where RowBinary wins on
 * *correctness*, not merely speed, and the headline of the wide-int/decimal
 * comparison in `ledger.bench.ts`.
 *
 * Columns (the trigger — generate this reader when a result has these types):
 *   txn_id   UInt128
 *   account  Int64
 *   amount   Decimal128(18)
 *   balance  Decimal128(18)
 *   fee      Decimal64(4)
 *   volume   UInt256
 *
 * Every value here exceeds what a JS `number` (IEEE-754 double, 53-bit mantissa)
 * can hold exactly, and ClickHouse emits them as **bare JSON numbers**. So
 * `JSON.parse` silently rounds every field — the only correct JSON path is to
 * quote the values server-side and re-parse each string into a `bigint` /
 * decimal pair by hand. RowBinary reads each as an exact `bigint` straight off
 * the wire. The whole row is fixed-width (16+8+16+16+8+32 = 96 bytes).
 */
export type LedgerRow = {
  txn_id: bigint;
  account: bigint;
  amount: DecimalValue;
  balance: DecimalValue;
  fee: DecimalValue;
  volume: bigint;
};

/**
 * API-combinator reader: correct and clear, one leaf reader per column. A fine
 * default; `readLedgerRowFast` is the monomorphized form `ledger.bench.ts`
 * measures. Both return identical values.
 */
export const readLedgerRow: Reader<LedgerRow> = (s) => ({
  txn_id: readUInt128(s),
  account: readInt64(s),
  amount: readDecimal128(18)(s),
  balance: readDecimal128(18)(s),
  fee: readDecimal64(4)(s),
  volume: readUInt256(s),
});

/**
 * Optimized, monomorphized reader: the six column bounds checks coalesce into
 * one `advance(s, 96)`; each wide value is composed from 64-bit words read at
 * constant offsets off that base, with the high word read **signed** for the
 * signed types (`Int64`, the `Decimal128` unscaled value, no high word needed
 * for the unsigned `UInt128`/`UInt256`). Stays streaming-safe (one `advance`).
 *
 *   txn_id   UInt128        @ o+0   lo + (hi<<64)            unsigned
 *   account  Int64          @ o+16  getBigInt64
 *   amount   Decimal128(18) @ o+24  lo + (hiSigned<<64)  -> [v, 18]
 *   balance  Decimal128(18) @ o+40  lo + (hiSigned<<64)  -> [v, 18]
 *   fee      Decimal64(4)   @ o+56  getBigInt64          -> [v, 4]
 *   volume   UInt256        @ o+64  w0 + w1<<64 + w2<<128 + w3<<192  unsigned
 */
export const readLedgerRowFast: Reader<LedgerRow> = (s) => {
  const { view } = s;
  const o = advance(s, 96); // one bounds check for the whole 96-byte row

  // UInt128 — unsigned, both words unsigned.
  const txn_id =
    view.getBigUint64(o, true) + (view.getBigUint64(o + 8, true) << 64n);

  // Int64 — signed.
  const account = view.getBigInt64(o + 16, true);

  // Decimal128(18) — Int128 unscaled (low word unsigned, high word signed), scale 18.
  const amount: DecimalValue = [
    view.getBigUint64(o + 24, true) + (view.getBigInt64(o + 32, true) << 64n),
    18,
  ];
  const balance: DecimalValue = [
    view.getBigUint64(o + 40, true) + (view.getBigInt64(o + 48, true) << 64n),
    18,
  ];

  // Decimal64(4) — Int64 unscaled, scale 4.
  const fee: DecimalValue = [view.getBigInt64(o + 56, true), 4];

  // UInt256 — unsigned, four unsigned words.
  const volume =
    view.getBigUint64(o + 64, true) +
    (view.getBigUint64(o + 72, true) << 64n) +
    (view.getBigUint64(o + 80, true) << 128n) +
    (view.getBigUint64(o + 88, true) << 192n);

  return { txn_id, account, amount, balance, fee, volume };
};
