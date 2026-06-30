import { bench, describe } from "vitest";
import { parseIPv4, parseIPv6 } from "../src/writers/ip.js";

/**
 * Benchmark: the string -> raw-bytes IP parsers. `parseIPv6` is the heavier one
 * (zero-run expansion, optional embedded IPv4) and was singled out in review, so
 * it gets the spread of forms; `parseIPv4` is included as the cheap baseline.
 *
 * Bench-independent of the writers: each case parses a static string, so it
 * measures only parsing cost. An equivalence guard runs first — a faster wrong
 * answer is worthless.
 */

const V4 = "192.168.0.1";
const V6_FULL = "2001:0db8:0000:0000:0000:ff00:0042:8329";
const V6_COMPRESSED = "2001:db8::ff00:42:8329";
const V6_MAPPED = "::ffff:1.2.3.4";

// Equivalence guards: compressed and full forms must parse to the same bytes.
if (parseIPv4(V4) !== 0xc0a80001) {
  throw new Error("parseIPv4 sanity check failed");
}
if (!parseIPv6(V6_FULL).equals(parseIPv6(V6_COMPRESSED))) {
  throw new Error("parseIPv6 full/compressed mismatch");
}

describe("parseIPv4", () => {
  bench("dotted quad", () => {
    parseIPv4(V4);
  });
});

describe("parseIPv6", () => {
  bench("fully expanded", () => {
    parseIPv6(V6_FULL);
  });
  bench("zero-run compressed", () => {
    parseIPv6(V6_COMPRESSED);
  });
  bench("IPv4-mapped", () => {
    parseIPv6(V6_MAPPED);
  });
});
