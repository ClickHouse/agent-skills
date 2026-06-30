import { type Reader, Cursor } from "./core.js";
import { readRows } from "./rows.js";

/** Empty buffer reused as the "no carry" sentinel between chunks. */
const EMPTY_CHUNK = Buffer.alloc(0);

/** Stats captured at the moment the small-chunk warning fires. */
export interface SmallChunkStats {
  /** Chunks consumed so far. */
  chunks: number;
  /** Rows decoded so far. */
  rows: number;
  /** `rows / chunks` — the ratio that tripped the threshold. */
  rowsPerChunk: number;
}

/**
 * Tuning for {@link streamRowBatches}'s small-chunk warning. Pass `false` to
 * disable it, `true` / omit for the defaults, or an object to tune.
 */
export type WarnOnSmallChunks =
  | boolean
  | {
      /**
       * Warn when the running `rows / chunks` average drops below this. Default
       * `2`: throw + restart re-decodes the partial trailing row on EVERY chunk,
       * so once a chunk barely covers a row or two the re-scan dominates — the
       * regime where `streamingRow.bench.ts` shows throw+restart losing to a lean
       * generator. Keep it low so the warning only fires when chunks are
       * genuinely too small, never on a healthy hundreds-of-rows-per-chunk stream.
       */
      minRowsPerChunk?: number;
      /**
       * Don't evaluate until this many chunks have been seen. Default `16`:
       * lets the average settle and suppresses the warning on small results,
       * where the gotcha doesn't bite (it only matters at megabytes / millions
       * of rows). A stream that ends before this never warns.
       */
      warmupChunks?: number;
      /** Where the warning goes. Default `console.warn`. */
      warn?: (message: string, stats: SmallChunkStats) => void;
    };

/** Options for {@link streamRowBatches}. */
export interface StreamRowBatchesOptions {
  /**
   * Diagnostic that catches a silent throughput killer: chunks so small that the
   * throw+restart streaming strategy spends most of its time re-decoding the
   * partial trailing row instead of making progress. Fires AT MOST ONCE per
   * stream. On by default; see {@link WarnOnSmallChunks} to tune or disable.
   *
   * The fix it points at is usually upstream — raise the HTTP response's read
   * size (Node sets the socket/stream `highWaterMark`; a fetch `Response.body`
   * reader delivers larger chunks than a hand-rolled tiny read) into the
   * tens–hundreds of KB range — or, when chunk size isn't yours to control,
   * compose {@link coalesceChunks} in front to merge small chunks first.
   */
  warnOnSmallChunks?: WarnOnSmallChunks;
}

/**
 * Stream a chunked `RowBinary` response into batches of decoded rows. This is
 * the async front door built on {@link readRows}: feed it the byte chunks of an
 * HTTP response (anything async-iterable — a Node `Readable`, `response.body`,
 * etc.) and a per-row `Reader`, and `for await` the batches.
 *
 * One batch is yielded per incoming chunk — exactly the rows that completed
 * within it — so batch size tracks chunk size, which the caller controls. A
 * chunk that doesn't complete a new row yields nothing; its bytes are carried
 * into the next chunk. Empty batches are never yielded.
 *
 * How it works (the carry-buffer driver):
 *  - Join the leftover `carry` from the previous chunk to the new chunk, build a
 *    state over the join, and run `readRows`. It decodes whole rows, stops cleanly
 *    on the partial trailing row (catching `NeedMoreData`), and leaves `pos` at
 *    that row's start.
 *  - The unread tail `pos..end` becomes the next `carry` as a `subarray` VIEW,
 *    NOT a copy. The joined buffer is owned entirely by this generator — it is
 *    never yielded to the caller — so there is no aliasing hazard in keeping a
 *    view into it, and we skip a per-chunk copy of the tail. The view is also
 *    short-lived: the next chunk's `Buffer.concat` copies these bytes into a
 *    fresh buffer, after which the old one is released.
 *  - When the stream ends, any non-empty carry means the response was truncated
 *    mid-row — a malformed stream — so it throws rather than silently dropping
 *    bytes.
 *
 * `readRow` is a `Reader<T>` — write it as `(s) => ({ id: readUInt64(s),
 * name: readString(s) })`. Build any configured/combinator readers ONCE (e.g.
 * `const readRow = readTupleNamed({...})`) and reuse, rather than rebuilding them
 * per chunk.
 *
 * ZERO-COPY NOTE: raw-bytes readers (`readUUID`/`readIPv6`/`readFixedStringBytes`
 * and binary `String`) return views into the current chunk's joined buffer. Those
 * stay valid as long as you hold the row objects, but are NOT views into one
 * stable buffer across batches. If you retain them long-term, copy in `readRow`.
 *
 * BACKPRESSURE: this is a pull stream — the next chunk is only requested when the
 * consumer asks for the next batch, so a slow consumer naturally throttles reading.
 *
 * The per-chunk bookkeeping for the small-chunk warning (two integer adds and a
 * compare) runs once per CHUNK, not per row, so it is off every hot path; the
 * default-on warning is documented in {@link StreamRowBatchesOptions}.
 */
export async function* streamRowBatches<T>(
  chunks: AsyncIterable<Uint8Array>,
  readRow: Reader<T>,
  options?: StreamRowBatchesOptions,
): AsyncGenerator<T[], void, undefined> {
  const drive = readRows(readRow);
  let carry: Buffer<ArrayBufferLike> = EMPTY_CHUNK;

  // Resolve the warning config once, outside the loop.
  const warnCfg = options?.warnOnSmallChunks;
  const warnEnabled = warnCfg !== false;
  const warnObj = typeof warnCfg === "object" ? warnCfg : undefined;
  const minRowsPerChunk = warnObj?.minRowsPerChunk ?? 2;
  const warmupChunks = warnObj?.warmupChunks ?? 16;
  const warn = warnObj?.warn ?? ((message: string) => console.warn(message));
  let chunkCount = 0;
  let rowCount = 0;
  let warned = false;

  for await (const chunk of chunks) {
    // Normalize to a Buffer without copying (a Uint8Array shares its ArrayBuffer).
    const incoming = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const work =
      carry.length === 0 ? incoming : Buffer.concat([carry, incoming]);

    const state = new Cursor(work);
    const rows = drive(state);
    if (rows.length > 0) yield rows;

    // Carry the unread tail (the partial trailing row, if any) to the next
    // chunk. A view, not a copy: we own `work` and never expose it, so keeping a
    // subarray into it is safe; the next concat copies these bytes out.
    carry = state.pos < work.length ? work.subarray(state.pos) : EMPTY_CHUNK;

    if (warnEnabled && !warned) {
      chunkCount++;
      rowCount += rows.length;
      const rowsPerChunk = rowCount / chunkCount;
      if (chunkCount >= warmupChunks && rowsPerChunk < minRowsPerChunk) {
        warned = true;
        warn(
          `RowBinary stream: chunks look too small — ${rowsPerChunk.toFixed(2)} rows/chunk over ${chunkCount} chunks. ` +
            `Streaming throws + restarts the partial trailing row on every chunk, so tiny chunks spend most of their ` +
            `time re-decoding instead of advancing. Increase the upstream read/highWaterMark to tens–hundreds of KB, ` +
            `or compose coalesceChunks() in front of this stream to merge small chunks first.`,
          { chunks: chunkCount, rows: rowCount, rowsPerChunk },
        );
      }
    }
  }
  if (carry.length > 0) {
    throw new Error(
      `RowBinary stream ended mid-row: ${carry.length} trailing byte(s) left undecoded`,
    );
  }
}

/** A timeout result distinct from any `IteratorResult`. */
const TIMED_OUT = Symbol("coalesceChunks.timeout");

/**
 * Coalesce (debounce) a chunk stream so each emitted chunk is at least `minSize`
 * bytes — a filter you compose IN FRONT of {@link streamRowBatches} when the
 * source delivers chunks too small to stream efficiently and you can't enlarge
 * them upstream:
 *
 *   streamRowBatches(coalesceChunks(httpChunks, { minSize: 64 * 1024, timeoutMs: 50 }), readRow)
 *
 * WHY: the throw+restart streaming strategy re-decodes the partial trailing row
 * on every chunk boundary, so the smaller the chunks the more time is wasted
 * re-scanning (see `streamingRow.bench.ts`). Merging small chunks up front cuts
 * the number of boundaries — and the backtracking with it.
 *
 * THE TRADE-OFF (latency vs. reallocation vs. backtracking): merging holds bytes
 * back until enough accumulate, so it ADDS up to `timeoutMs` of latency to data
 * that arrives in a trickle, and it COPIES via `Buffer.concat` to join the parts
 * (one extra allocation per emitted chunk). In return the downstream parser
 * backtracks far less. Tune `minSize` to the downstream sweet spot (tens–hundreds
 * of KB) and `timeoutMs` to the latency you can spare.
 *
 * SEMANTICS:
 *  - Accumulates incoming chunks until their total reaches `minSize`, then emits
 *    the join immediately.
 *  - A batch below `minSize` is flushed early when `timeoutMs` elapses from the
 *    moment its FIRST byte arrived (the deadline is anchored, not reset per
 *    chunk — a steady trickle of tiny chunks can't defer the flush forever).
 *  - While nothing is buffered it blocks indefinitely for the next chunk: an idle
 *    or finished stream is never charged the timeout.
 *  - End of stream flushes whatever remains (possibly below `minSize`); a single
 *    already-large-enough chunk passes straight through with no copy.
 *
 * It keeps exactly ONE outstanding pull on the source at a time (never calls
 * `next()` while a prior result is still in flight), reads one chunk ahead so it
 * can race arrival against the timer, and releases the source via `return()` if
 * the consumer abandons it early.
 */
export async function* coalesceChunks(
  source: AsyncIterable<Uint8Array>,
  { minSize, timeoutMs }: { minSize: number; timeoutMs: number },
): AsyncGenerator<Buffer, void, undefined> {
  const it = source[Symbol.asyncIterator]();
  // The single in-flight pull. Read one ahead so we always have a promise to
  // race the timer against; never start a second next() before this resolves.
  let pull = it.next();
  let parts: Buffer[] = [];
  let buffered = 0;
  let deadline = 0; // ms timestamp; armed when the first byte enters an empty batch

  const asBuffer = (u8: Uint8Array): Buffer =>
    Buffer.isBuffer(u8)
      ? u8
      : Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);

  const flush = (): Buffer => {
    // One part: hand it back as-is (no concat, no copy). Many: join them.
    const out = parts.length === 1 ? parts[0]! : Buffer.concat(parts, buffered);
    parts = [];
    buffered = 0;
    return out;
  };

  const take = (u8: Uint8Array): void => {
    const b = asBuffer(u8);
    parts.push(b);
    buffered += b.length;
  };

  try {
    while (true) {
      if (buffered === 0) {
        // Nothing buffered: block for the next chunk with no timeout.
        const r = await pull;
        if (r.done) return;
        take(r.value);
        deadline = Date.now() + timeoutMs;
        pull = it.next();
        if (buffered >= minSize) yield flush();
        continue;
      }

      // Below minSize with bytes in hand: race the next chunk against the time
      // left on this batch's anchored deadline.
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        yield flush();
        continue;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), remaining);
      });
      const r = await Promise.race([pull, timeout]);
      clearTimeout(timer); // no-op if it already fired; frees the loop otherwise
      if (r === TIMED_OUT) {
        // pull is STILL outstanding — keep it; just flush what we have so far.
        yield flush();
        continue;
      }
      if (r.done) {
        yield flush(); // emit the tail; stream is over
        return;
      }
      take(r.value);
      pull = it.next();
      if (buffered >= minSize) yield flush();
    }
  } finally {
    // Consumer broke out early (break/throw): let the source clean up.
    if (typeof it.return === "function") await it.return();
  }
}
