/**
 * WASM proof kernel — the one experiment from the "why JS, not WASM" case study.
 *
 * Sums an `Int128` column three ways over the SAME 32 MB RowBinary buffer:
 *   1. JS BigInt   — what JS MUST do to add 128-bit integers (heap bigints).
 *   2. JS f64 fold — the raw read floor (reads the same bytes, wrong math) to
 *                    show how fast V8 streams the memory: "JITed JS at mem speed".
 *   3. WASM        — a hand-emitted kernel doing native i64 add-with-carry,
 *                    the one place WASM structurally beats JS.
 *
 * Also measures the boundary tax: copying the buffer into WASM linear memory.
 *
 * Run:  node tests/wasm-int128.experiment.mjs
 * Needs a live ClickHouse at $CLICKHOUSE_URL (default http://localhost:8123).
 */
const URL_BASE = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
const N = 2_000_000;

// --- 1. hand-emit a tiny WASM module: void sum128(i32 ptr, i32 lenBytes) ----
// It folds 16-byte little-endian Int128s into a 128-bit accumulator (two i64s
// with carry) and writes [lo @ mem0, hi @ mem8]. The whole point: the per-row
// add never touches the JS heap.
const leb = (n) => {
  const out = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return out;
};
const str = (s) => [s.length, ...[...Buffer.from(s)]];
const section = (id, content) => [id, ...leb(content.length), ...content];

// locals after params (0=ptr i32, 1=len i32):
//   2=p i32, 3=end i32, 4=accLo i64, 5=accHi i64, 6=lo i64, 7=hi i64, 8=newLo i64
const body = [
  0x02,
  0x02,
  0x7f,
  0x05,
  0x7e, // locals: 2×i32, 5×i64
  0x20,
  0x00,
  0x21,
  0x02, // p = ptr
  0x20,
  0x00,
  0x20,
  0x01,
  0x6a,
  0x21,
  0x03, // end = ptr + len
  0x02,
  0x40, // block
  0x03,
  0x40, //   loop
  0x20,
  0x02,
  0x20,
  0x03,
  0x4f,
  0x0d,
  0x01, // if p >=u end: break
  0x20,
  0x02,
  0x29,
  0x03,
  0x00,
  0x21,
  0x06, // lo = i64.load[p]
  0x20,
  0x02,
  0x29,
  0x03,
  0x08,
  0x21,
  0x07, // hi = i64.load[p+8]
  0x20,
  0x04,
  0x20,
  0x06,
  0x7c,
  0x21,
  0x08, // newLo = accLo + lo
  0x20,
  0x05,
  0x20,
  0x07,
  0x7c, // accHi + hi
  0x20,
  0x08,
  0x20,
  0x04,
  0x54,
  0xad,
  0x7c, // + (newLo <u accLo ? 1 : 0)  carry
  0x21,
  0x05, // accHi = ...
  0x20,
  0x08,
  0x21,
  0x04, // accLo = newLo
  0x20,
  0x02,
  0x41,
  0x10,
  0x6a,
  0x21,
  0x02, // p += 16
  0x0c,
  0x00, //   continue loop
  0x0b, //   end loop
  0x0b, // end block
  0x41,
  0x00,
  0x20,
  0x04,
  0x37,
  0x03,
  0x00, // mem[0] = accLo
  0x41,
  0x00,
  0x20,
  0x05,
  0x37,
  0x03,
  0x08, // mem[8] = accHi
  0x0b, // end function
];

const moduleBytes = Uint8Array.from([
  0x00,
  0x61,
  0x73,
  0x6d,
  0x01,
  0x00,
  0x00,
  0x00, // magic + version
  ...section(1, [0x01, 0x60, 0x02, 0x7f, 0x7f, 0x00]), // type: (i32,i32)->()
  ...section(3, [0x01, 0x00]), // func 0 : type 0
  ...section(5, [0x01, 0x00, 0x02]), // memory: min 2 pages
  ...section(7, [
    0x02,
    ...str("memory"),
    0x02,
    0x00,
    ...str("sum128"),
    0x00,
    0x00,
  ]),
  ...section(10, [0x01, ...leb(body.length), ...body]), // code
]);

const mod = await WebAssembly.compile(moduleBytes); // throws if malformed — a free validator
const inst = await WebAssembly.instantiate(mod, {});
const { memory, sum128 } = inst.exports;

// --- fetch the Int128 column ------------------------------------------------
const sql = `SELECT toInt128(number) * 123456789012345 AS x FROM numbers(${N}) FORMAT RowBinary`;
const res = await fetch(URL_BASE, { method: "POST", body: sql });
if (!res.ok) throw new Error(`ClickHouse ${res.status}: ${await res.text()}`);
const buf = Buffer.from(await res.arrayBuffer());
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const MB = buf.length / 1e6;
const reps = 20;
const ms = (t) => Number(t) / 1e6 / reps;
const gbs = (msPass) => MB / 1e3 / (msPass / 1e3);

// --- 1. JS BigInt 128-bit sum (correct; what you must do today) -------------
let acc = 0n;
let t = process.hrtime.bigint();
for (let r = 0; r < reps; r++) {
  acc = 0n;
  for (let o = 0; o < buf.length; o += 16) {
    const lo = view.getBigUint64(o, true);
    const hi = view.getBigInt64(o + 8, true);
    acc += (hi << 64n) + lo;
  }
}
const bigintMs = ms(process.hrtime.bigint() - t);

// --- 2. JS f64 fold: the raw read floor (V8 at memory speed) ----------------
let sink = 0;
t = process.hrtime.bigint();
for (let r = 0; r < reps; r++) {
  let a = 0;
  for (let o = 0; o < buf.length; o += 16)
    a += view.getFloat64(o, true) + view.getFloat64(o + 8, true);
  sink = a;
}
const floorMs = ms(process.hrtime.bigint() - t);

// --- 3. WASM kernel ---------------------------------------------------------
const INPUT_OFF = 64; // results live in mem[0..16); input clear of them
const needPages = Math.ceil((INPUT_OFF + buf.length) / 65536);
const havePages = memory.buffer.byteLength / 65536;
if (needPages > havePages) memory.grow(needPages - havePages);

// boundary tax: copy the network buffer into linear memory
t = process.hrtime.bigint();
for (let r = 0; r < reps; r++)
  new Uint8Array(memory.buffer, INPUT_OFF, buf.length).set(buf);
const copyMs = ms(process.hrtime.bigint() - t);

// kernel only (buffer already resident)
t = process.hrtime.bigint();
for (let r = 0; r < reps; r++) sum128(INPUT_OFF, buf.length);
const kernelMs = ms(process.hrtime.bigint() - t);

const mview = new DataView(memory.buffer);
const wasmSum =
  (mview.getBigUint64(8, true) << 64n) + mview.getBigUint64(0, true);
if (wasmSum !== acc) throw new Error(`WASM sum ${wasmSum} != BigInt ${acc}`);

console.log(
  `\nInt128 column sum — ${N.toLocaleString()} rows, ${MB.toFixed(0)} MB, ${reps} reps (Node ${process.version})`,
);
console.log(`  correctness: WASM == BigInt == ${acc}  ✓\n`);
const row = (name, msPass, note = "") =>
  console.log(
    `  ${name.padEnd(34)} ${msPass.toFixed(2).padStart(7)} ms   ${gbs(msPass).toFixed(1).padStart(5)} GB/s   ${note}`,
  );
row("1. JS BigInt-128 sum (correct)", bigintMs, "← what JS must do");
row("2. JS f64 fold (read floor)", floorMs, "← V8 at memory speed");
row("3. WASM i64 add-carry, kernel only", kernelMs);
row(
  "   WASM + copy-in boundary tax",
  kernelMs + copyMs,
  `(copy ${copyMs.toFixed(2)} ms)`,
);
console.log(
  `\n  BigInt tax vs read floor : ${(bigintMs / floorMs).toFixed(1)}x`,
);
console.log(
  `  WASM kernel vs BigInt    : ${(bigintMs / kernelMs).toFixed(1)}x faster`,
);
console.log(
  `  WASM+copy vs BigInt      : ${(bigintMs / (kernelMs + copyMs)).toFixed(1)}x faster`,
);
console.log(
  `  WASM kernel vs read floor: ${(kernelMs / floorMs).toFixed(2)}x  (1.0 = at memory speed)`,
);
if (sink === undefined) throw new Error("floor sink"); // keep `sink` observable so V8 can't elide the fold
