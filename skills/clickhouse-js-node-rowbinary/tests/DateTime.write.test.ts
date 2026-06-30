import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { encode } from "./encode.js";
import {
  writeDate,
  writeDate32,
  writeDateTime,
  writeDateTime64,
  writeDateTime64P3,
  writeDateTime64P6,
  writeDateTime64P9,
} from "../src/writers/datetime.js";

describe("writeDate / writeDate32", () => {
  it("encodes a Date as days since the epoch", async () =>
    expect(encode(writeDate, new Date(Date.UTC(2021, 6, 7)))).toEqual(
      await query("SELECT toDate('2021-07-07') FORMAT RowBinary"),
    ));
  it("encodes a pre-1970 Date32 (negative day count)", async () =>
    expect(encode(writeDate32, new Date(Date.UTC(1950, 0, 2)))).toEqual(
      await query("SELECT toDate32('1950-01-02') FORMAT RowBinary"),
    ));
});

describe("writeDateTime", () => {
  it("encodes a DateTime as Unix seconds", async () =>
    expect(
      encode(writeDateTime, new Date(Date.UTC(2021, 6, 7, 18, 30, 0))),
    ).toEqual(
      await query(
        "SELECT toDateTime('2021-07-07 18:30:00', 'UTC') FORMAT RowBinary",
      ),
    ));
});

// Sub-day / sub-second inputs are floored to the encoded unit, never rounded
// up. Asserted purely (encode-vs-encode against the truncated instant) so the
// cases run without a live ClickHouse and can't be masked by a reader.
describe("date/time flooring", () => {
  it("floors a near-midnight Date down to its own calendar day", () =>
    expect(
      encode(writeDate, new Date(Date.UTC(2021, 6, 7, 23, 59, 59))),
    ).toEqual(encode(writeDate, new Date(Date.UTC(2021, 6, 7)))));

  it("floors a pre-1970 Date32 toward the earlier day, not the epoch", () =>
    expect(
      encode(writeDate32, new Date(Date.UTC(1969, 11, 31, 12, 0, 0))),
    ).toEqual(encode(writeDate32, new Date(Date.UTC(1969, 11, 31)))));

  it("floors a sub-second DateTime down, never up to the next second", () =>
    expect(
      encode(writeDateTime, new Date(Date.UTC(2021, 6, 7, 18, 30, 0, 600))),
    ).toEqual(
      encode(writeDateTime, new Date(Date.UTC(2021, 6, 7, 18, 30, 0))),
    ));
});

describe("writeDateTime64", () => {
  const wholeSecond = new Date(Date.UTC(2021, 6, 7, 18, 30, 0));

  it("encodes DateTime64(9) via the generic writer", async () =>
    expect(encode(writeDateTime64(9), [wholeSecond, 123456789])).toEqual(
      await query(
        "SELECT toDateTime64('2021-07-07 18:30:00.123456789', 9, 'UTC') FORMAT RowBinary",
      ),
    ));

  it("encodes a negative DateTime64(9) instant", async () =>
    expect(
      encode(writeDateTime64(9), [new Date(Date.UTC(1960, 0, 1, 0, 0, 0)), 1]),
    ).toEqual(
      await query(
        "SELECT toDateTime64('1960-01-01 00:00:00.000000001', 9, 'UTC') FORMAT RowBinary",
      ),
    ));

  it("encodes DateTime64(3) via writeDateTime64P3", async () =>
    expect(
      encode(writeDateTime64P3, new Date(Date.UTC(2021, 6, 7, 18, 30, 0, 123))),
    ).toEqual(
      await query(
        "SELECT toDateTime64('2021-07-07 18:30:00.123', 3, 'UTC') FORMAT RowBinary",
      ),
    ));

  it("encodes DateTime64(6) via writeDateTime64P6", async () =>
    expect(encode(writeDateTime64P6, [wholeSecond, 123456])).toEqual(
      await query(
        "SELECT toDateTime64('2021-07-07 18:30:00.123456', 6, 'UTC') FORMAT RowBinary",
      ),
    ));

  it("encodes DateTime64(9) via writeDateTime64P9", async () =>
    expect(encode(writeDateTime64P9, [wholeSecond, 123456789])).toEqual(
      await query(
        "SELECT toDateTime64('2021-07-07 18:30:00.123456789', 9, 'UTC') FORMAT RowBinary",
      ),
    ));
});
