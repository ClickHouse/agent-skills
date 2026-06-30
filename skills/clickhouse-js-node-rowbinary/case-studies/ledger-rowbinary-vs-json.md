# Case study: RowBinary vs JSON on a financial ledger (wide ints & decimals)

**TL;DR** — When every column is wider than a JS `number` can hold (`UInt128`,
`Int64`, `Decimal128(18)`, `UInt256`), RowBinary wins _twice over_. Stock
`JSON.parse` is not merely slow here — it is **silently wrong**, rounding every
value to a float64. The only correct JSON path quotes the values server-side and
re-parses each string into a `bigint`/decimal pair by hand, which is **~5x
slower** than the optimized RowBinary reader over a **2.1–2.6x larger** wire.
RowBinary reads each value exactly, straight off the wire.

This is the workload the [SKILL's format-choice
guidance](../SKILL.md#first-is-rowbinary-even-the-right-format) calls out
explicitly: "RowBinary clearly wins when the result is dominated by **wide
numerics** — `Int128`/`Int256`/`UInt128`/`UInt256`, `Decimal128`/`Decimal256`."

Reproduce: `npx vitest bench --run tests/ledger.bench.ts` (against a live
ClickHouse server). Source: [`tests/ledger.bench.ts`](../tests/ledger.bench.ts),
reader: [`src/examples/ledger.ts`](../src/examples/ledger.ts).

## The data

A financial ledger — every column exceeds IEEE-754 double's 53-bit exact range:

```sql
txn_id   UInt128         -- 16 bytes
account  Int64           --  8 bytes  (values past 2^53)
amount   Decimal128(18)  -- 16 bytes  (~32 significant digits)
balance  Decimal128(18)  -- 16 bytes
fee      Decimal64(4)    --  8 bytes
volume   UInt256         -- 32 bytes
```

50,000 rows, fixed-width (96 bytes/row), fetched from a live server.

## The correctness trap

ClickHouse emits these types as **bare, unquoted JSON numbers**. So stock
`JSON.parse` parses them as float64 and silently corrupts every one — measured
on row 0 of the live result:

| Column    | Exact value (RowBinary)                   | `JSON.parse` of bare JSON                 |                  |
| --------- | ----------------------------------------- | ----------------------------------------- | ---------------- |
| `txn_id`  | `340282366920938463463374607431768200000` | `340282366920938463463374607431768211456` | ✗ off by 11 456  |
| `account` | `9007199254740993`                        | `9007199254740992`                        | ✗ off by 1       |
| `amount`  | `98765432109876.123456789012345678`       | `98765432109876.12`                       | ✗ lost 16 digits |

No exception, no warning — just wrong numbers. For money and IDs, that is a
correctness bug, not a performance footnote.

### Making JSON correct costs extra work

The only way to get exact values through JSON is to **quote them server-side** so
they arrive as strings, then re-parse each one:

```sql
... SETTINGS output_format_json_quote_64bit_integers = 1,
             output_format_json_quote_decimals = 1
```

```ts
txn_id:  BigInt(r.txn_id),                 // string -> bigint
amount:  parseDecimal(r.amount, 18),       // string -> [unscaled, scale]
```

That per-field `BigInt(...)` / decimal parse is work RowBinary doesn't do — it
reads the exact `bigint` directly with two `DataView` reads — and it lands on
top of a larger wire (strings are longer than the binary words).

## Wire size (correct paths quote wide values as strings)

| Format                      | Size     | vs RowBinary |
| --------------------------- | -------- | ------------ |
| RowBinary                   | 4.80 MB  | 1.0x         |
| JSONCompactEachRow (quoted) | 9.88 MB  | 2.1x         |
| JSONEachRow (quoted)        | 12.28 MB | 2.6x         |

## Decode throughput (full 50k-row decode; higher = faster)

| Decoder                                            | ops/s | ms/decode | ≈ rows/s | speedup  | correct?       |
| -------------------------------------------------- | ----- | --------- | -------- | -------- | -------------- |
| **RowBinary — optimized**                          | 130   | 7.71      | ~6.5 M   | **1.0x** | ✅             |
| RowBinary — API combinators                        | 80    | 12.50     | ~4.0 M   | 0.62x    | ✅             |
| JSONEachRow bare — `JSON.parse` only               | 44    | 22.74     | ~2.2 M   | 0.34x    | ❌ **corrupt** |
| JSONCompactEachRow quoted — parse + BigInt/decimal | 26    | 37.78     | ~1.3 M   | 0.20x    | ✅             |
| JSONEachRow quoted — parse + BigInt/decimal        | 25    | 40.70     | ~1.2 M   | 0.19x    | ✅             |

_Node 24 / V8. Your numbers will vary; run `npm run bench` on your own hardware._

## Takeaways

- **The fast JSON path is the wrong one.** Bare `JSON.parse` is JSON's quickest
  option and it is still 2.95x slower than RowBinary — _and_ it silently
  corrupts every wide value. There is no "fast and correct" JSON here.
- **The correct JSON path is ~5x slower.** Quote + per-field `BigInt`/decimal
  parsing is the price of correctness, on top of a 2.1–2.6x larger wire.
- **RowBinary is correct by construction.** Each value is composed from 64-bit
  words read at constant offsets (high word signed for the signed types),
  yielding an exact `bigint` or `[unscaled, scale]` pair — no rounding, no
  string re-parsing.
- **Contrast with the [IoT case study](iot-rowbinary-vs-json.md):** there the
  numbers fit a float64 and the win was purely throughput (3.5x). Here the values
  don't fit, so the win is _correctness first_, throughput second. Match the
  format to the shape of the data.
