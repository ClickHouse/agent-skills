import { channel } from "node:diagnostics_channel";
import { BufferFull, Sink, type Writer } from "./core.js";

/** Default sink size when `writeRows` isn't given one — a typical flush chunk. */
const DEFAULT_BUFFER_SIZE = 64 * 1024;

/**
 * Payload of {@link FLUSH_CHANNEL_NAME}, published once per buffer `writeRows`
 * flushes — the hook for buffer-capacity-utilization metrics (e.g. an OTEL
 * `used_bytes` / `capacity_bytes` counter pair, divided in the backend for a
 * byte-weighted average fill). Identity (table, `query_id`, …) is deliberately
 * NOT here: carry it in `AsyncLocalStorage` and read it in the subscriber, which
 * runs synchronously on the publisher's call stack, so its async context is live.
 */
export interface WriteRowsFlush {
  /** Bytes actually written into the buffer just flushed (`<= capacityBytes`). */
  usedBytes: number;
  /** That buffer's capacity; doubles from `bufferSize` to fit an oversized row. */
  capacityBytes: number;
  /**
   * The configured initial buffer size for this run. `capacityBytes > bufferSize`
   * means the buffer had to grow to fit an oversized row, and `usedBytes /
   * bufferSize` is the overflow magnitude — the signal that `bufferSize` is too
   * small. (Growth is sticky: once grown, every later flush in the run reports the
   * larger `capacityBytes`, so compare against `bufferSize`, not a prior capacity.)
   */
  bufferSize: number;
  /** Why it flushed: `"full"` mid-stream (next row overflowed) or `"end"` (rows ran out). */
  reason: "full" | "end";
}

/**
 * `node:diagnostics_channel` name {@link writeRows} publishes a {@link WriteRowsFlush}
 * once per flushed buffer. Subscribe to observe buffer-capacity utilization; with no
 * subscriber `writeRows` skips the publish entirely (a single `hasSubscribers`
 * check per buffer, off the per-row path), so it's free when unused.
 */
export const FLUSH_CHANNEL_NAME = "@clickhouse/rowbinary:writeRows.flush";

/** Created once — `channel()` is idempotent (same name → same object). */
const flushChannel = channel(FLUSH_CHANNEL_NAME);

/**
 * Drive `writeRow` over every row of an iterable into a plain `RowBinary` payload
 * — the encode mirror of `readRows`. Rows are concatenated with NO count, length
 * prefix, or delimiter (just as the reader expects), so `writeRow` must emit
 * EXACTLY one row's bytes. Curried: `writeRows(writeRow)` returns the driver.
 *
 * Returns a GENERATOR rather than a `Writer<readonly T[]>` on purpose. A `Sink`
 * wraps a FIXED-length buffer, so a large (or unbounded) result won't fit in one
 * pass — when a row would overflow, `writeRow` throws {@link BufferFull} from
 * `reserve`, and a plain `(sink, rows) => void` would let that escape mid-row,
 * leaving the caller unable to tell how many rows actually made it in. Instead
 * this owns the sink: it catches `BufferFull`, rewinds to the last COMPLETE row
 * boundary (never a half-written row), `yield`s that batch, and starts a FRESH
 * `Sink` for the rows that didn't fit. Because each flush gets its own buffer,
 * every yielded `Buffer` stays valid after the generator resumes — safe to retain
 * or hand to an async sink, no copy needed. The caller supplies a `bufferSize`,
 * not a sink, and `rows` is an `Iterable<T>` (not a fixed array), so the same
 * driver handles a future infinite/streaming row source unchanged.
 *
 * The driver loop is just a `for...of` — the generator yields each batch of whole
 * rows whenever it stops accumulating (on overflow, or when the rows run out), so
 * the final batch comes through the same channel and there's nothing to flush
 * afterwards:
 *
 *   const drive = writeRows(writeRow);
 *   for (const chunk of drive(rows, 64 * 1024)) send(chunk);
 *
 * OVERSIZED ROWS: when a single row won't fit even an empty buffer, the buffer is
 * GROWN (doubled) and the row retried — never dropped, never thrown. The first
 * time this happens `writeRows` `console.warn`s ONCE (the buffer may keep doubling
 * after that) so an under-sized `bufferSize` or a pathologically large row doesn't
 * pass unnoticed.
 *
 * METRICS: each flushed buffer is published as a {@link WriteRowsFlush} on the
 * {@link FLUSH_CHANNEL_NAME} diagnostics channel — wire it to a utilization metric.
 * No subscriber means no publish (one `hasSubscribers` check per buffer).
 *
 * When generating code, inline the per-column writes into the loop body,
 * mirroring the reader.
 */
export function writeRows<T>(
  writeRow: Writer<T>,
): (rows: Iterable<T>, bufferSize?: number) => Generator<Buffer, void, void> {
  return function* (rows, bufferSize = DEFAULT_BUFFER_SIZE) {
    if (!Number.isSafeInteger(bufferSize) || bufferSize <= 0)
      // Guard the growth loop: a 0 / NaN / negative size makes the first row
      // overflow forever (`size *= 2` never escapes 0/NaN), so fail fast instead.
      throw new RangeError(
        `RowBinary writeRows: bufferSize must be a positive integer, got ${bufferSize}`,
      );
    let size = bufferSize;
    let warned = false;
    let sink = new Sink(Buffer.allocUnsafe(size));
    for (const row of rows) {
      while (true) {
        const committed = sink.pos; // start of this row — the last clean boundary
        try {
          writeRow(sink, row);
          break; // row written cleanly — on to the next
        } catch (e) {
          if (e !== BufferFull) throw e;
          if (committed === 0) {
            // An empty buffer couldn't hold even this one row: double it and
            // retry the SAME row — never drop it. Nothing was written, so the
            // discarded sink had no bytes to flush.
            size *= 2;
            if (!warned) {
              warned = true;
              console.warn(
                `RowBinary writeRows: a row didn't fit bufferSize=${bufferSize}; ` +
                  `growing the buffer beyond it (possibly more than once). Raise bufferSize.`,
              );
            }
            sink = new Sink(Buffer.allocUnsafe(size));
            continue;
          }
          sink.pos = committed; // drop the partially written row, then flush
          if (flushChannel.hasSubscribers)
            flushChannel.publish({
              usedBytes: committed,
              capacityBytes: size,
              bufferSize,
              reason: "full",
            } satisfies WriteRowsFlush);
          yield sink.bytes();
          sink = new Sink(Buffer.allocUnsafe(size)); // fresh buffer; retry the row
        }
      }
    }
    if (sink.pos > 0) {
      // the final batch
      if (flushChannel.hasSubscribers)
        flushChannel.publish({
          usedBytes: sink.pos,
          capacityBytes: size,
          bufferSize,
          reason: "end",
        } satisfies WriteRowsFlush);
      yield sink.bytes();
    }
  };
}
