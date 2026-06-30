import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { Cursor } from "../src/readers/core.js";
import { readHeader } from "../src/readers/header.js";

/** Fetch a `RowBinaryWithNamesAndTypes` response (header + rows) as a cursor. */
async function withNamesAndTypes(select: string): Promise<Cursor> {
  return new Cursor(await query(`${select} FORMAT RowBinaryWithNamesAndTypes`));
}

describe("readHeader", () => {
  it("reads column count, names, then types and stops at the first row", async () => {
    const s = await withNamesAndTypes("SELECT toUInt32(7) AS id, 'x' AS name");

    expect(readHeader(s)).toEqual({
      names: ["id", "name"],
      types: ["UInt32", "String"],
    });
    // Cursor now points at the row payload (the first column's UInt32).
    expect(s.buf.readUInt32LE(s.pos)).toBe(7);
  });
});
