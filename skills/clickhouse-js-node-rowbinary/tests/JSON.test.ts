import { describe, expect, it } from "vitest";
import { query } from "./clickhouse.js";
import { NeedMoreData, Cursor } from "../src/readers/core.js";
import { readDynamic } from "../src/readers/dynamic.js";
import { readJSON } from "../src/readers/json.js";

const J = "SETTINGS allow_experimental_json_type = 1, enable_json_type = 1";

async function reader(expr: string): Promise<Cursor> {
  return new Cursor(await query(`SELECT ${expr} ${J} FORMAT RowBinary`));
}

describe("readJSON", () => {
  it("reads (path, Dynamic value) pairs into a Map", async () => {
    const r = await reader(`'{"a":1}'::JSON`);
    expect(readJSON(r)).toEqual(new Map([["a", 1n]])); // a -> Int64 1
  });

  it("reads multiple paths, each with its own inline type", async () => {
    const r = await reader(`'{"a":1,"b":"hi"}'::JSON`);
    expect(readJSON(r)).toEqual(
      new Map<string, unknown>([
        ["b", "hi"], // String
        ["a", 1n], // Int64
      ]),
    );
  });

  it("FLATTENS nested objects to dotted paths", async () => {
    const r = await reader(`'{"a":{"b":2}}'::JSON`);
    expect(readJSON(r)).toEqual(new Map([["a.b", 2n]]));
  });

  it("an empty object is zero paths", async () => {
    const r = await reader(`'{}'::JSON`);
    expect(readJSON(r)).toEqual(new Map());
  });

  it("a null-valued path is NOT stored — same as an empty object", async () => {
    const r = await reader(`'{"a":null}'::JSON`);
    expect(readJSON(r)).toEqual(new Map()); // {"a":null} serializes as 0 paths
  });

  it("a JSON array path decodes as Array(Nullable(T)) via Dynamic", async () => {
    const r = await reader(`'{"a":[1,2]}'::JSON`);
    expect(readJSON(r)).toEqual(new Map([["a", [1n, 2n]]]));
  });

  it("decodes mixed scalar types (Float64, Bool)", async () => {
    const r = await reader(`'{"x":1.5,"y":true}'::JSON`);
    expect(readJSON(r)).toEqual(
      new Map<string, unknown>([
        ["y", true],
        ["x", 1.5],
      ]),
    );
  });

  // JSON nested inside a Dynamic: the 0x30 tag's type-encoding header precedes
  // the body, which readDynamicType consumes before delegating to readJSON.
  describe("inside a Dynamic (tag 0x30, with the type-encoding header)", () => {
    async function dyn(expr: string): Promise<Cursor> {
      return new Cursor(
        await query(
          `SELECT CAST(${expr} AS Dynamic) ${J}, allow_experimental_dynamic_type = 1 FORMAT RowBinary`,
        ),
      );
    }

    it("decodes a JSON value, skipping the parameter header", async () => {
      const r = await dyn(`'{"a":1}'::JSON`);
      expect(readDynamic(r)).toEqual(new Map([["a", 1n]]));
    });

    it("recurses through Array(JSON)", async () => {
      const r = await dyn(`['{"a":1}'::JSON, '{"b":2}'::JSON]`);
      expect(readDynamic(r)).toEqual([
        new Map([["a", 1n]]),
        new Map([["b", 2n]]),
      ]);
    });

    it("throws on declared typed paths (need the schema to read them)", async () => {
      const r = await dyn(`'{"a":1}'::JSON(b UInt32)`);
      expect(() => readDynamic(r)).toThrow(/typed paths/);
    });
  });

  describe("advance() edge cases", () => {
    it("throws NeedMoreData for every incomplete prefix (0 .. full.length-1)", async () => {
      const full = await query(`SELECT '{"a":1}'::JSON ${J} FORMAT RowBinary`);
      for (let len = 0; len < full.length; len++) {
        const r = new Cursor(full.subarray(0, len));
        let thrown: unknown;
        try {
          readJSON(r);
        } catch (e) {
          thrown = e;
        }
        expect(thrown, `prefix length ${len} of ${full.length}`).toBe(
          NeedMoreData,
        );
      }
    });
  });
});
