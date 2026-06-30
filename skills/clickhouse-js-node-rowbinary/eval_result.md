# Eval result — RowBinary skill (24 evals, with-skill vs no-skill)

**Date:** 2026-06-20
**Model:** Claude Opus 4.8 (1M context) — `claude-opus-4-8[1m]` (executors and grader)
**Harness:** Claude Code 2.1.183
**Method:** skill-creator eval loop. For each of the 24 evals in
[`evals/evals.json`](evals/evals.json), an isolated subagent generated a parser
**with the skill** (told to read `SKILL.md` + the routed `src/` reader) and a
**no-skill control** (own knowledge, no access to the skill). Each output was
graded against that eval's assertions. 1 run per cell; graded by an LLM grader
against the assertions (no live-ClickHouse ground truth — that is what
[`skill-bench`](.claude/skills/skill-bench/SKILL.md) adds).

## Headline

| Metric        | With skill    | Without skill | Delta          |
| ------------- | ------------- | ------------- | -------------- |
| Pass rate     | **94.7%**     | 71.5%         | **+23pp**      |
| Wall time     | 90.4s ± 36.7s | 58.0s ± 21.4s | +32.4s (~1.6×) |
| Output tokens | 32066 ± 7096  | 17483 ± 2028  | +14583 (~1.8×) |

The skill raised correctness on every knowledge-heavy type and never _lowered_
it on the hard ones. The cost is reading `SKILL.md` + the routed reader and
emitting extra variants/self-tests.

## Per-eval pass rate

| Eval                                      | With     | Without  | Δ         |
| ----------------------------------------- | -------- | -------- | --------- |
| 0 fixed-width numerics (Buffer)           | 1.00     | 0.40     | +0.60     |
| 1 DateTime64(3)/Float32 endianness        | 1.00     | 0.50     | +0.50     |
| 2 varint length reader                    | 1.00     | 0.40     | +0.60     |
| 3 Int64/Int128 precision                  | 1.00     | 0.60     | +0.40     |
| 4 Buffer slice / DataView windowing       | 1.00     | 0.80     | +0.20     |
| 5 Decimal64/IPv4 format separation        | 1.00     | 0.67     | +0.33     |
| 6 UUID byte-order                         | 1.00     | 1.00     | 0         |
| 7 FixedString / binary String             | 1.00     | 1.00     | 0         |
| 8 BFloat16 array                          | 1.00     | 1.00     | 0         |
| 9 Enum8 underlying int                    | 1.00     | 0.83     | +0.17     |
| 10 Date/DateTime tz metadata              | 0.80     | 0.80     | 0         |
| 11 DateTime64(9) nanoseconds              | 0.60     | 0.40     | +0.20     |
| 12 Time/Time64 durations                  | 1.00     | 0.60     | +0.40     |
| 13 LowCardinality/SimpleAggregateFunction | 1.00     | 1.00     | 0         |
| 14 Variant discriminant name-sort         | 1.00     | 1.00     | 0         |
| 15 Nested = Array(Tuple)                  | 1.00     | 1.00     | 0         |
| 16 AggregateFunction opaque state         | **1.00** | **0.00** | **+1.00** |
| 17 Dynamic runtime dispatch               | 1.00     | 1.00     | 0         |
| 18 Dynamic nested type-headers            | 1.00     | 0.67     | +0.33     |
| 19 JSON = paths + Dynamic                 | 1.00     | 0.33     | +0.67     |
| 20 hot UUID/IPv6/Array zero-copy          | 0.83     | 0.83     | 0         |
| 21 Float32 array benchmark                | **0.67** | **0.83** | **−0.17** |
| 22 documented String/Int64 toggles        | 1.00     | 0.83     | +0.17     |
| 23 Array(Tuple) monomorphized             | 0.83     | 0.67     | +0.17     |

## Where the skill clearly earns its keep

Correctness gaps the model gets wrong unaided:

- **eval-16 AggregateFunction opaque state — 100% vs 0%.** Without the skill the
  agent invents a byte-level decoder and claims the state is splittable /
  round-trippable. The skill correctly refuses and points to server-side
  finalization.
- **eval-19 JSON — 100% vs 33%.** Without the skill the agent falls back to
  `CAST(col AS String)` + `JSON.parse`; only the skill decodes the
  varuint-path-count + (String path, Dynamic value) wire and handles the
  JSON-in-Dynamic `0x30` header and typed-path bail-out.
- **eval-18 Dynamic nested type-headers — 100% vs 67%.** The control invents
  wrong type-encoding tag bytes and never consumes `max_dynamic_types`.
- **evals 0/2 (DataView windowing, varint unrolling) — 100% vs 40%**, plus
  endianness scaffolding (1), Time64 ScaledTicks (12), signed Int128 high word
  (3), Decimal scale preservation (5).

## Genuine gaps the eval surfaced (candidate skill fixes)

1. **Skill regressed on eval-21 (float32 benchmark): 67% vs 83%.** Both configs
   emitted `.mjs` not TypeScript (TS-default assertion failed in _both_), and the
   no-skill control added an independent source-byte oracle while the with-skill
   run only cross-validated the two strategies against each other. The skill
   teaches equivalence-before-timing but not an _independent_ oracle.
2. **TypeScript-default is unreliable on optimization/benchmark prompts** —
   with-skill emitted plain `.mjs` on evals 21 and 23 despite the "TS by default"
   assertion (eval-0 did produce `.ts`).
3. **Holey-array rule misfired on the one eval that targets it (eval-20, 5/6
   both):** both used `new Array(n)` + index for a "millions of rows" hot tag
   array; the skill's small-vs-large `[]`+push heuristic didn't fire and the run
   even justified `new Array(n)`. The guidance is ambiguous when an array is both
   count-known _and_ large.
4. **Weakest with the skill: eval-10 (0.80) and eval-11 (0.60)** — the skill
   version omitted the "one `Date` allocation per value, offer raw-count on a hot
   path" note (10) and only partially delivered the `[Date, nanoseconds]` split
   (11).

## Caveats

- Non-discriminating evals (6, 7, 8, 13, 14, 15, 17 all tie ≈100%) measure
  baseline model competence, not skill lift. On 14/17 the no-skill run even got
  the subtle name-sort / runtime-dispatch right; the assertions don't test the
  concrete Dynamic tag bytes, which is where no-skill was actually shaky.
- 1 run per (eval, config); per-eval deltas are point estimates, not
  variance-controlled. For server-truth correctness (decode vs what the live
  ClickHouse server produced) use [`skill-bench`](.claude/skills/skill-bench/SKILL.md).

_Raw per-assertion gradings, the benchmark JSON, and the interactive review
viewer live in the sibling `…-workspace/iteration-1/` directory
(`benchmark.json`, `benchmark.md`, `review.html`)._
