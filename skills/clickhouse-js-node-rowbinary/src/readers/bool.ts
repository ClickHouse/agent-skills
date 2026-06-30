import { Cursor } from "./core.js";
import { readUInt8 } from "./integers.js";

/**
 * Read a `Bool`: 1 byte, stored as `UInt8` (`0` = false, `1` = true). Treats any
 * non-zero byte as true.
 */
export function readBool(state: Cursor): boolean {
  return readUInt8(state) !== 0;
}
