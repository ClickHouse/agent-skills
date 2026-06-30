import { bench, describe } from "vitest";
import { formatUUID, formatUUIDTable } from "../src/readers/reader.js";

/**
 * Benchmark: the BigInt-based formatUUID vs the lookup-table formatUUIDTable
 * (byte -> packed-hex table written into a preallocated buffer, no BigInt, no
 * intermediate slices). Both format the same raw 16 bytes.
 *
 * This benchmark is reader-independent: each case formats a static 16-byte
 * buffer directly, so it measures only the formatting cost — `readUUID` just
 * returns a zero-copy 16-byte subarray, which would otherwise add noise.
 */

// Wire bytes for 61f0c404-5cb3-11e7-907b-a6006ad3dba0 (two LE UInt64 halves).
const WIRE = Buffer.from([
  0xe7, 0x11, 0xb3, 0x5c, 0x04, 0xc4, 0xf0, 0x61, 0xa0, 0xdb, 0xd3, 0x6a, 0x00,
  0xa6, 0x7b, 0x90,
]);
const EXPECTED = "61f0c404-5cb3-11e7-907b-a6006ad3dba0";

// Equivalence guard: a faster wrong answer is worthless. Validate before timing.
const viaFormat = formatUUID(WIRE);
const viaTable = formatUUIDTable(WIRE);
if (viaFormat !== EXPECTED || viaTable !== EXPECTED) {
  throw new Error(
    `UUID mismatch: format=${viaFormat} table=${viaTable} expected=${EXPECTED}`,
  );
}

describe("UUID formatting", () => {
  bench("formatUUID (BigInt + toString)", () => {
    formatUUID(WIRE);
  });

  bench("formatUUIDTable (lookup table + preallocated buffer)", () => {
    formatUUIDTable(WIRE);
  });
});
