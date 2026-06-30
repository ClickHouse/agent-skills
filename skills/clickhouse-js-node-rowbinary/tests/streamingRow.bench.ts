import { bench, describe } from "vitest";

/**
 * Streaming "need more bytes" mechanism benchmark — throw vs generator-yield.
 *
 * A streaming parser must, when it runs out of bytes mid-result, suspend and
 * resume once more arrive. Two ways to signal "give me more bytes":
 *
 *   1. THROW a sentinel and let the driver re-enter the parser (this file's
 *      `parseThrow`). A plain function; the cost is throw/catch stack unwinding.
 *   2. YIELD a request from a generator and resume it via `.next()` once bytes
 *      arrive. Ergonomic — the parser reads as if synchronous — but every read
 *      runs inside a generator state machine.
 *
 * To measure ONLY that mechanism, the model is deliberately stripped down:
 *
 *   - The stream is ONE contiguous buffer whose AVAILABLE length grows. "More
 *     bytes arrived" = bump `avail` by a chunk. So no contender pays for
 *     stitching separate chunk buffers — that cost is identical for both in
 *     reality and would only add noise here.
 *   - The row shape is known (5 × little-endian UInt32 = 20 bytes), as it always
 *     is for a bespoke generated parser. So each parser checks whether the WHOLE
 *     row is available before reading any field. Consequence: neither parser
 *     ever re-reads a field on resume — `parseThrow` restarts from a clean row
 *     boundary, the generators suspend between rows. The "generators avoid
 *     re-parsing" argument therefore does NOT apply here; what's left is purely
 *     throw/catch unwinding vs generator resume.
 *
 * Contenders:
 *   - throw + restart            — plain function, `throw MORE` when starved.
 *   - generator (yield* reader)  — combinator style: `const a = yield* r.u32()`.
 *                                  Two levels of generator delegation per field;
 *                                  the "great on paper" form.
 *   - generator (inline yield)   — one generator, row-level `while(...) yield`,
 *                                  fields read inline. The lean generator, shown
 *                                  so the combinator's overhead isn't mistaken
 *                                  for "all generators".
 *
 * Two chunk regimes are timed: a realistic large chunk (suspends rarely; steady
 * state dominates) and a tiny sub-row chunk (suspends constantly; the mechanism
 * cost dominates). Read the numbers on your own machine — that's the point.
 */

const ROWS = 50_000;
const FIELDS_PER_ROW = 5;
const ROW_BYTES = FIELDS_PER_ROW * 4; // 5 × UInt32
const N = ROWS * FIELDS_PER_ROW; // total field count
const TOTAL = ROWS * ROW_BYTES;

// Build the payload once: field k (global index) holds the value k, so the
// expected checksum is the exact triangular sum and stays < 2^53 (no masking).
const PAYLOAD = new Uint8Array(TOTAL);
{
  const dv = new DataView(PAYLOAD.buffer);
  for (let k = 0; k < N; k++) dv.setUint32(k * 4, k, true);
}
const EXPECTED = { rows: ROWS, sum: (N * (N - 1)) / 2 };

type Result = { rows: number; sum: number };

/** Singleton sentinel thrown on starvation — a bare value, so no Error stack is
 * captured (that capture, not the unwind, is what makes throwing Errors slow). */
const MORE = Symbol("need-more-bytes");

/**
 * THROW approach. `avail` grows by `chunkSize` each time the parser starves.
 * Reads restart from `committed` (the last completed row); because the whole-row
 * check precedes any field read, a restart re-reads nothing.
 */
function parseThrow(bytes: Uint8Array, chunkSize: number): Result {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let avail = 0;
  let committed = 0;
  let rows = 0;
  let sum = 0;
  for (;;) {
    try {
      let pos = committed;
      while (pos < TOTAL) {
        if (pos + ROW_BYTES > avail) throw MORE;
        sum +=
          dv.getUint32(pos, true) +
          dv.getUint32(pos + 4, true) +
          dv.getUint32(pos + 8, true) +
          dv.getUint32(pos + 12, true) +
          dv.getUint32(pos + 16, true);
        pos += ROW_BYTES;
        rows++;
        committed = pos;
      }
      return { rows, sum };
    } catch (err) {
      if (err !== MORE) throw err;
      avail = Math.min(TOTAL, avail + chunkSize);
    }
  }
}

/**
 * Combinator generator reader. Each `u32()` is itself a generator that suspends
 * until its 4 bytes are available, so the parse body reads as if synchronous:
 * `const a = yield* r.u32()`. `avail` is mutated on the reader between resumes.
 */
function makeGenReader(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    pos: 0,
    avail: 0,
    *u32(): Generator<undefined, number, undefined> {
      while (this.pos + 4 > this.avail) yield;
      const v = dv.getUint32(this.pos, true);
      this.pos += 4;
      return v;
    },
  };
}

function* parseGenCombinator(
  r: ReturnType<typeof makeGenReader>,
): Generator<undefined, Result, undefined> {
  let rows = 0;
  let sum = 0;
  while (r.pos < TOTAL) {
    const a = yield* r.u32();
    const b = yield* r.u32();
    const c = yield* r.u32();
    const d = yield* r.u32();
    const e = yield* r.u32();
    sum += a + b + c + d + e;
    rows++;
  }
  return { rows, sum };
}

/**
 * Lean generator: a single generator, whole-row availability checked with an
 * inline `while (...) yield`, fields read inline. No per-field delegation, so it
 * runs at near-normal speed between the (rare) suspensions.
 */
function* parseGenInline(
  bytes: Uint8Array,
  box: { avail: number },
): Generator<undefined, Result, undefined> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  let rows = 0;
  let sum = 0;
  while (pos < TOTAL) {
    while (pos + ROW_BYTES > box.avail) yield;
    sum +=
      dv.getUint32(pos, true) +
      dv.getUint32(pos + 4, true) +
      dv.getUint32(pos + 8, true) +
      dv.getUint32(pos + 12, true) +
      dv.getUint32(pos + 16, true);
    pos += ROW_BYTES;
    rows++;
  }
  return { rows, sum };
}

/** Drive a generator to completion, revealing `chunkSize` more bytes per
 * suspension via the shared `holder.avail`. Returns the generator's `return`. */
function driveGen(
  gen: Generator<undefined, Result, undefined>,
  holder: { avail: number },
  chunkSize: number,
): Result {
  let step = gen.next();
  while (!step.done) {
    holder.avail = Math.min(TOTAL, holder.avail + chunkSize);
    step = gen.next();
  }
  return step.value;
}

function runGenCombinator(chunkSize: number): Result {
  const r = makeGenReader(PAYLOAD);
  return driveGen(parseGenCombinator(r), r, chunkSize);
}

function runGenInline(chunkSize: number): Result {
  const box = { avail: 0 };
  return driveGen(parseGenInline(PAYLOAD, box), box, chunkSize);
}

// Equivalence guard: a faster wrong answer is worthless. Validate every
// contender at both chunk regimes before any timing runs.
function assertCorrect(label: string, got: Result): void {
  if (got.rows !== EXPECTED.rows || got.sum !== EXPECTED.sum) {
    throw new Error(
      `${label} mismatch: got rows=${got.rows} sum=${got.sum}, ` +
        `expected rows=${EXPECTED.rows} sum=${EXPECTED.sum}`,
    );
  }
}
for (const cs of [64 * 1024, 8]) {
  assertCorrect(`throw cs=${cs}`, parseThrow(PAYLOAD, cs));
  assertCorrect(`gen-combinator cs=${cs}`, runGenCombinator(cs));
  assertCorrect(`gen-inline cs=${cs}`, runGenInline(cs));
}

describe("streaming need-more-bytes: 64 KB chunks (suspends rarely)", () => {
  const cs = 64 * 1024;
  bench("throw + restart", () => {
    parseThrow(PAYLOAD, cs);
  });
  bench("generator (yield* reader)", () => {
    runGenCombinator(cs);
  });
  bench("generator (inline yield)", () => {
    runGenInline(cs);
  });
});

describe("streaming need-more-bytes: 8-byte chunks (suspends constantly)", () => {
  const cs = 8;
  bench("throw + restart", () => {
    parseThrow(PAYLOAD, cs);
  });
  bench("generator (yield* reader)", () => {
    runGenCombinator(cs);
  });
  bench("generator (inline yield)", () => {
    runGenInline(cs);
  });
});
