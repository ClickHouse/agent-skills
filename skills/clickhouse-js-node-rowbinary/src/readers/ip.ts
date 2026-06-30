import { Cursor, advance } from "./core.js";

/**
 * Read an `IPv4`: stored as a 4-byte little-endian `UInt32`. Returns the raw
 * 32-bit value (the little-endian load already orders the octets); pass it to
 * {@link formatIPv4} for the dotted-quad string.
 */
export function readIPv4(state: Cursor): number {
  return state.view.getUint32(advance(state, 4), true);
}

/**
 * Read an `IPv6`: 16 bytes in network (big-endian) order. Returns the raw bytes
 * as a zero-copy view; pass them to {@link formatIPv6} for the canonical string.
 *
 * The view shares memory with the response buffer, so keeping it alive pins the
 * whole response chunk in memory. If the value must outlive the row/response,
 * copy it with `Buffer.from(...)`.
 */
export function readIPv6(state: Cursor): Buffer {
  const start = advance(state, 16);
  return state.buf.subarray(start, start + 16);
}

/**
 * Format an `IPv4` (the raw 32-bit value from {@link readIPv4}) as a dotted-quad
 * string. Kept aside so the hot read path can skip building a string when the
 * numeric value is all the caller needs.
 */
export function formatIPv4(value: number): string {
  return `${(value >>> 24) & 0xff}.${(value >>> 16) & 0xff}.${(value >>> 8) & 0xff}.${value & 0xff}`;
}

/**
 * Join groups `[from, to)` as colon-separated lowercase hex, by concatenating
 * into a string in a loop. Benchmarks faster than `slice().map().join(":")`,
 * which allocates an intermediate array. Returns `""` for an empty range.
 */
function joinGroupsHex(g: number[], from: number, to: number): string {
  if (from >= to) return "";
  let s = g[from]!.toString(16);
  for (let i = from + 1; i < to; i++) s += ":" + g[i]!.toString(16);
  return s;
}

/**
 * Format an `IPv6` (the raw 16 bytes from {@link readIPv6}) as the canonical
 * RFC 5952 string: lowercase, no leading zeros, the longest run of zero groups
 * (>= 2) collapsed to `::` (leftmost on a tie), and the `::ffff:a.b.c.d` form
 * for IPv4-mapped addresses (matching ClickHouse).
 *
 * Kept aside from the read so the hot path only formats when a string is
 * actually needed.
 */
export function formatIPv6(b: Buffer): string {
  // IPv4-mapped (::ffff:a.b.c.d): first 10 bytes zero, then 0xffff.
  let mapped = b[10] === 0xff && b[11] === 0xff;
  for (let i = 0; mapped && i < 10; i++) {
    if (b[i] !== 0) mapped = false;
  }
  if (mapped) {
    return `::ffff:${b[12]}.${b[13]}.${b[14]}.${b[15]}`;
  }

  // Eight 16-bit groups, big-endian.
  const g: number[] = [];
  for (let i = 0; i < 8; i++) {
    g.push((b[2 * i]! << 8) | b[2 * i + 1]!);
  }

  // Longest run of >= 2 zero groups becomes "::" (leftmost wins on a tie).
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < 8; i++) {
    if (g[i] === 0) {
      if (curStart < 0) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }
  if (bestLen < 2) {
    return joinGroupsHex(g, 0, 8);
  }
  return `${joinGroupsHex(g, 0, bestStart)}::${joinGroupsHex(g, bestStart + bestLen, 8)}`;
}
