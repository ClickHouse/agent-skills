import { describe, expect, it } from "vitest";
import { encode } from "./encode.js";
import { writeNothing } from "../src/writers/nothing.js";
import { writeArray, writeNullable } from "../src/writers/composite.js";

describe("writeNothing", () => {
  it("throws if ever invoked directly", () =>
    expect(() => encode(writeNothing, undefined as never)).toThrow(
      /Nothing is zero-width/,
    ));

  it("is never invoked for an empty Array(Nothing)", () =>
    // Just the varint length 0x00; the element writer never runs.
    expect([...encode(writeArray(writeNothing), [])]).toEqual([0x00]));

  it("is never invoked for a NULL Nullable(Nothing)", () =>
    // Just the NULL flag byte 0x01; the inner writer never runs.
    expect([...encode(writeNullable(writeNothing), null)]).toEqual([0x01]));
});
