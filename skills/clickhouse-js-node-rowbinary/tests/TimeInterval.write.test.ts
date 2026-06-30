import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { encode } from "./encode.js";
import {
  writeTime,
  writeTime64,
  parseTime,
  parseTime64,
} from "../src/writers/time.js";
import { writeInterval } from "../src/writers/interval.js";

describe("writeTime", () => {
  it("encodes 12:34:56", async () =>
    expect(encode(writeTime, parseTime("12:34:56"))).toEqual(
      await query(
        "SELECT CAST('12:34:56' AS Time) SETTINGS enable_time_time64_type = 1 FORMAT RowBinary",
      ),
    ));
  it("encodes a negative -01:02:03", async () =>
    expect(encode(writeTime, parseTime("-01:02:03"))).toEqual(
      await query(
        "SELECT CAST('-01:02:03' AS Time) SETTINGS enable_time_time64_type = 1 FORMAT RowBinary",
      ),
    ));
});

describe("writeTime64", () => {
  it("encodes Time64(3)", async () =>
    expect(encode(writeTime64, parseTime64("12:34:56.789", 3))).toEqual(
      await query(
        "SELECT toTime64('12:34:56.789', 3) SETTINGS enable_time_time64_type = 1 FORMAT RowBinary",
      ),
    ));
  it("encodes a negative Time64(6)", async () =>
    expect(encode(writeTime64, parseTime64("-01:02:03.000004", 6))).toEqual(
      await query(
        "SELECT toTime64('-01:02:03.000004', 6) SETTINGS enable_time_time64_type = 1 FORMAT RowBinary",
      ),
    ));
});

describe("parseTime64", () => {
  it("scales whole seconds and the fraction to ticks", () =>
    expect(parseTime64("12:34:56.789", 3)).toEqual([
      (12n * 3600n + 34n * 60n + 56n) * 1000n + 789n,
      3,
    ]));
  it("handles a negative value with a short fraction", () =>
    expect(parseTime64("-01:02:03.5", 1)).toEqual([
      -((1n * 3600n + 2n * 60n + 3n) * 10n + 5n),
      1,
    ]));
});

describe("writeInterval", () => {
  it("encodes toIntervalDay(7)", async () =>
    expect(encode(writeInterval, 7n)).toEqual(
      await query("SELECT toIntervalDay(7) FORMAT RowBinary"),
    ));
  it("encodes a negative toIntervalSecond(-90)", async () =>
    expect(encode(writeInterval, -90n)).toEqual(
      await query("SELECT toIntervalSecond(-90) FORMAT RowBinary"),
    ));
  it("encodes toIntervalYear(2)", async () =>
    expect(encode(writeInterval, 2n)).toEqual(
      await query("SELECT toIntervalYear(2) FORMAT RowBinary"),
    ));
});
