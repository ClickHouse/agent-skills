/**
 * Thrown by {@link advance} when the buffer lacks the bytes a read needs — the
 * "need more bytes" signal for incremental decoding over a still-filling buffer.
 * A driver catches it (`err === NeedMoreData`), waits for more input, and retries
 * the row from its last committed position.
 *
 * A bare sentinel, NOT an `Error` subclass, on purpose: constructing an Error
 * captures a stack trace — the expensive part of throwing — and on a path that
 * starves once per chunk that cost is pure waste. Throwing a constant skips it,
 * which is why throw + restart beats a generator's yield for realistic chunks
 * (see `streamingRow.bench.ts`).
 */
export const NeedMoreData = Symbol("RowBinary.NeedMoreData");

/**
 * The cursor state every reader threads through: the input `Buffer`, the current
 * position, and a `DataView` over the same bytes.
 *
 * Deliberately STATE only — no read methods. Decoding lives in the free
 * `readX(state, ...)` functions in the sibling modules, so a generated parser
 * pulls in only the per-type readers a result needs. `view`/`buf` are public so
 * those free functions can reach them.
 */
export class Cursor {
  pos = 0;

  /**
   * Node-only skill, so the input is a `Buffer`: number reads go through
   * {@link Cursor.view} (DataView), while `String`/`FixedString` use the
   * fast `buf.toString("utf8", ...)`.
   */
  readonly buf: Buffer;

  /**
   * `DataView` over the same bytes, for fixed-width integer/float reads. Built
   * with the buffer's own `byteOffset`/`byteLength`: a `Buffer` is often a window
   * into a larger pooled `ArrayBuffer`, so `new DataView(buf.buffer)` alone would
   * point at the wrong bytes.
   */
  readonly view: DataView;

  constructor(buf: Buffer) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
}

/**
 * A `Reader<T>` decodes one value of type `T` from the cursor, advancing it. Leaf
 * readers (e.g. `readUInt32`) are `Reader`s directly; combinators (e.g.
 * `readArray`) take sub-`Reader`s and return a `Reader`, so types compose with no
 * per-element closures.
 */
export type Reader<T> = (state: Cursor) => T;

/**
 * Reserve `n` bytes for the next read: bounds-check them, advance the cursor past
 * them, and return the offset the read starts at (the value BEFORE advancing).
 * Every fixed-width read goes through this, so the length check and cursor
 * bookkeeping live in one place:
 *
 *   function readInt32(s) { return s.view.getInt32(advance(s, 4), true); }
 *
 * Throws {@link NeedMoreData} when fewer than `n` bytes remain, WITHOUT moving the
 * cursor, so a driver can rewind to its last committed row and retry.
 *
 * SAFE TO TOGGLE: for a complete in-memory buffer the check never fires — a parser
 * for that case can drop `advance` and read against `state.pos` directly, trading
 * streaming tolerance for one fewer compare per read.
 */
export function advance(state: Cursor, n: number): number {
  const start = state.pos;
  const next = start + n;
  if (next > state.buf.length) throw NeedMoreData;
  state.pos = next;
  return start;
}
