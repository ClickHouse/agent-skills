import { NeedMoreData, type Reader } from "./core.js";

/**
 * Drive `readRow` over every row of a plain `RowBinary` result into an array.
 * Curried: `readRows(readRow)` returns a `Reader<T[]>`. Rows are concatenated on
 * the wire with no count, length prefix, or delimiter, so the result is exhausted
 * only when the cursor reaches the buffer end.
 *
 * `readRow` must consume EXACTLY one row's bytes — a byte short or long compounds
 * across rows and the cursor overshoots or never lands on `buf.length`. Returns
 * `[]` for an empty buffer. When generating code, inline the per-column reads
 * into the loop body:
 *
 *   function readRowsUser(s) {
 *     const out = [];
 *     while (s.pos < s.buf.length) {
 *       out.push({ id: readUInt64(s), name: readString(s) });
 *     }
 *     return out;
 *   }
 *
 * STREAMING (partial trailing row): a chunk of a still-arriving response may end
 * mid-row. `pos` is committed only AFTER a row reads cleanly, so when a row
 * starves and `readRow` throws {@link NeedMoreData}, this catches it, rewinds
 * `pos` to the last complete row boundary, and returns the rows so far — never a
 * half-built row. The cursor is left at the straddling row, a commit point the
 * driver carries forward:
 *
 *   const drive = readRows(readRow);
 *   let committed = 0;
 *   for (const chunk of chunks) {              // chunk = growing prefix
 *     const s = new Cursor(chunk);
 *     s.pos = committed;
 *     emit(drive(s));                          // complete rows in this chunk
 *     committed = s.pos;                        // start of the straddling row
 *   }
 *
 * On a complete buffer no read starves, so the catch never runs. Errors other
 * than {@link NeedMoreData} are real decode faults and propagate. See also
 * `streamRowBatches`, the async driver built on this.
 */
export function readRows<T>(readRow: Reader<T>): Reader<T[]> {
  return (state) => {
    const out: T[] = [];
    let committed = state.pos;
    try {
      while (state.pos < state.buf.length) {
        const row = readRow(state);
        committed = state.pos; // row read cleanly — advance the commit point
        out.push(row);
      }
    } catch (e) {
      if (e !== NeedMoreData) throw e;
      state.pos = committed; // drop the partial trailing row; resume next chunk
    }
    return out;
  };
}
