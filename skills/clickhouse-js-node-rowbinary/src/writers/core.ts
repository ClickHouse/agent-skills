/**
 * Thrown by {@link reserve} when the sink's buffer is full — i.e. lacks the bytes
 * a write needs. The encode-side mirror of the reader's `NeedMoreData`. Like the
 * reader, the `Sink` treats its buffer as a FIXED-length window: when a write
 * would overflow it, `reserve` throws this sentinel WITHOUT moving the position,
 * so a driver can flush the bytes written so far down the connection (a transport
 * filter can glue successive buffers back together) and continue into a fresh
 * buffer.
 *
 * A bare sentinel, NOT an `Error` subclass, on purpose — exactly as `NeedMoreData`
 * on the read side: constructing an `Error` captures a stack trace (the expensive
 * part of throwing), pure waste on a path that fires once per buffer boundary.
 */
export const BufferFull = Symbol("RowBinary.BufferFull");

/**
 * The write-side mirror of the reader's `Cursor`: the cursor every writer threads
 * through. A `Buffer` to write into, the current write position, and a
 * `DataView` over the same bytes. The encode counterpart of decode's `Cursor`.
 *
 * Deliberately STATE only — no write methods. Encoding lives in the free
 * `writeX(sink, value)` functions in the sibling modules, so a generated encoder
 * pulls in only the per-type writers a result needs (exactly like the reader
 * side). `view`/`buf` are public so those free functions can reach them.
 *
 * Like a `Cursor`, a `Sink` wraps a FIXED-length buffer (supplied by the caller):
 * it never reallocates. {@link reserve} throws {@link BufferFull} when the next
 * write would overflow, the encode mirror of the reader's `advance` throwing
 * `NeedMoreData` on underflow. Size the buffer to a chunk you intend to flush, and
 * pull the written bytes with {@link Sink.bytes}.
 */
export class Sink {
  pos = 0;

  /**
   * The buffer being written into. Only `buf.subarray(0, pos)` (see
   * {@link Sink.bytes}) holds written bytes; the tail is unwritten headroom.
   * Built with the buffer's own `byteOffset`/`byteLength` view in
   * {@link Sink.view}, exactly like the reader's `Cursor`.
   */
  readonly buf: Buffer;

  /**
   * `DataView` over {@link Sink.buf}, for fixed-width integer/float writes. Built
   * with the buffer's own `byteOffset`/`byteLength`: a `Buffer` is often a window
   * into a larger pooled `ArrayBuffer`, so `new DataView(buf.buffer)` alone would
   * point at the wrong bytes.
   */
  readonly view: DataView;

  constructor(buf: Buffer) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  /**
   * The written bytes — `buf.subarray(0, pos)`. A zero-copy VIEW into the sink's
   * buffer, so use `Buffer.from(sink.bytes())` if you need an independent copy.
   */
  bytes(): Buffer {
    return this.buf.subarray(0, this.pos);
  }
}

/**
 * A `Writer<T>` encodes one value of type `T` into the sink, advancing it — the
 * mirror of the reader's `Reader<T>`. Leaf writers (e.g. `writeUInt32`) are
 * `Writer`s directly; combinators (e.g. `writeArray`) take sub-`Writer`s and
 * return a `Writer`, so types compose with no per-element closures.
 */
export type Writer<T> = (sink: Sink, value: T) => void;

/**
 * Reserve `n` bytes for the next write: bounds-check them, advance the position
 * past them, and return the offset the write starts at (the value BEFORE
 * advancing). The write-side mirror of the reader's `advance`: every fixed-width
 * write goes through it, so the capacity check and position bookkeeping live in
 * one place:
 *
 *   function writeInt32(s, v) { s.view.setInt32(reserve(s, 4), v, true); }
 *
 * Throws {@link BufferFull} when fewer than `n` bytes remain, WITHOUT moving
 * the position — the buffer is fixed-length, exactly as the reader's input is, so
 * a driver flushes what is written and retries the row into a fresh buffer.
 */
export function reserve(sink: Sink, n: number): number {
  const start = sink.pos;
  const next = start + n;
  if (next > sink.buf.length) throw BufferFull;
  sink.pos = next;
  return start;
}
