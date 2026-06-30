import { Sink, type Writer } from "../src/writers/core.js";

/**
 * Encode a single value with `write` into a fresh {@link Sink} and return the
 * bytes. The shared shape of every `*.write.test.ts`.
 *
 * Writer tests are INDEPENDENT of the readers: the test supplies the JS value
 * itself and asserts the encoded bytes equal what ClickHouse emits (the source of
 * truth, see `clickhouse.ts`) or a hard-coded expectation — never a value decoded
 * by the reader. That way a reader bug cannot mask a writer bug, and vice versa.
 *
 * `capacity` sizes the (fixed-length) sink buffer; the default comfortably fits
 * every value under test.
 */
export function encode<T>(write: Writer<T>, value: T, capacity = 4096): Buffer {
  const sink = new Sink(Buffer.allocUnsafe(capacity));
  write(sink, value);
  return Buffer.from(sink.bytes());
}
