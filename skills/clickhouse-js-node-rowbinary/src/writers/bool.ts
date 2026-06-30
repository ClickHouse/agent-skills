import { Sink } from "./core.js";
import { writeUInt8 } from "./integers.js";

/**
 * Write a `Bool`: 1 byte, stored as `UInt8` (`false` -> 0, `true` -> 1). Mirror
 * of `readBool`.
 */
export function writeBool(sink: Sink, value: boolean): void {
  writeUInt8(sink, value ? 1 : 0);
}
