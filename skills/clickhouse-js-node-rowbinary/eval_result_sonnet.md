# Eval result (Sonnet) — RowBinary skill (24 evals, with-skill vs no-skill)

**Date:** 2026-06-20
**Model:** Claude Sonnet 4.6 — `claude-sonnet-4-6` (executors). Grader: Claude Opus 4.8 — `claude-opus-4-8[1m]` (held constant as the measurement instrument, same as the [Opus run](eval_result.md))
**Harness:** Claude Code 2.1.183
**Method:** identical to the [Opus run](eval_result.md) — for each of the 24 evals in
[`evals/evals.json`](evals/evals.json), an isolated Sonnet subagent generated a parser
**with the skill** and a **no-skill control**, scored by an Opus grader against the
eval's assertions. 1 run per cell; no live-ClickHouse ground truth (use
[`skill-bench`](.claude/skills/skill-bench/SKILL.md) for server truth).

## Headline

| Metric        | With skill    | Without skill | Delta           |
| ------------- | ------------- | ------------- | --------------- |
| Pass rate     | **94.0%**     | 60.4%         | **+34pp**       |
| Wall time     | 93.3s ± 26.9s | 73.4s ± 24.8s | +19.9s (~1.27×) |
| Output tokens | 30529 ± 5335  | 18416 ± 1987  | +12113 (~1.66×) |

**The skill delta is larger on Sonnet (+34pp) than on Opus (+23pp)** — not because
with-skill is better (94.0% vs Opus's 94.7%, essentially tied), but because Sonnet's
_unaided_ baseline is weaker (60.4% vs Opus's 71.5%). In other words, the skill brings
Sonnet up to roughly the same place Opus-with-skill reaches, closing most of the
model-capability gap.

## With-skill vs without-skill by eval (Sonnet)

| Eval                                      | With     | Without  | Δ         |
| ----------------------------------------- | -------- | -------- | --------- |
| 0 fixed-width numerics (Buffer)           | 1.00     | 0.80     | +0.20     |
| 1 DateTime64(3)/Float32 endianness        | 1.00     | 0.25     | +0.75     |
| 2 varint length reader                    | 1.00     | 0.40     | +0.60     |
| 3 Int64/Int128 precision                  | 1.00     | 0.60     | +0.40     |
| 4 Buffer slice / DataView windowing       | 1.00     | 0.80     | +0.20     |
| 5 Decimal64/IPv4 format separation        | 1.00     | 0.50     | +0.50     |
| 6 UUID byte-order                         | 1.00     | 0.20     | +0.80     |
| 7 FixedString / binary String             | 1.00     | 1.00     | 0         |
| 8 BFloat16 array                          | 1.00     | 1.00     | 0         |
| 9 Enum8 underlying int                    | 0.83     | 0.67     | +0.16     |
| 10 Date/DateTime tz metadata              | 0.80     | 0.80     | 0         |
| 11 DateTime64(9) nanoseconds              | 0.60     | 0.40     | +0.20     |
| 12 Time/Time64 durations                  | 1.00     | 0.40     | +0.60     |
| 13 LowCardinality/SimpleAggregateFunction | 1.00     | 1.00     | 0         |
| 14 Variant discriminant name-sort         | 1.00     | 1.00     | 0         |
| 15 Nested = Array(Tuple)                  | 1.00     | 1.00     | 0         |
| 16 AggregateFunction opaque state         | **1.00** | **0.00** | **+1.00** |
| 17 Dynamic runtime dispatch               | 1.00     | 0.67     | +0.33     |
| 18 Dynamic nested type-headers            | 1.00     | 0.50     | +0.50     |
| 19 JSON = paths + Dynamic                 | **1.00** | **0.00** | **+1.00** |
| 20 hot UUID/IPv6/Array zero-copy          | 1.00     | 0.50     | +0.50     |
| 21 Float32 array benchmark                | **0.33** | **0.83** | **−0.50** |
| 22 documented String/Int64 toggles        | 1.00     | 0.67     | +0.33     |
| 23 Array(Tuple) monomorphized             | 1.00     | 0.50     | +0.50     |

## Sonnet vs Opus (both grader = Opus 4.8)

|                          | With skill | Without skill | Delta |
| ------------------------ | ---------- | ------------- | ----- |
| **Opus 4.8** executors   | 94.7%      | 71.5%         | +23pp |
| **Sonnet 4.6** executors | 94.0%      | 60.4%         | +34pp |

Where Sonnet-unaided falls down harder than Opus-unaided (and the skill rescues it):

- **eval-6 UUID — 0.20 vs Opus-noskill 1.00.** Sonnet misdiagnoses the layout as
  big-endian and hexes bytes in wire order — exactly the scrambling the prompt describes.
- **eval-19 JSON — 0.00 vs Opus 0.33.** Sonnet insists the column is plain UTF-8 JSON text.
- **eval-16 AggregateFunction — 0.00.** Invents a LEB128 length prefix for the unframed state.
- **eval-1 endianness — 0.25**, **eval-12 Time — 0.40**, **eval-5 Decimal — 0.50**,
  **eval-17/18 Dynamic — 0.67/0.50.** All lifted to 1.00 with the skill.

## Findings that reproduce across BOTH models (highest-priority skill fixes)

1. **eval-21 (float32 benchmark) regression — and worse on Sonnet: 0.33 vs 0.83
   (Opus: 0.67 vs 0.83).** Same root cause both times: the with-skill run omits the
   equivalence guard, timing the two decoders without ever comparing their outputs.
   The skill teaches equivalence-before-timing but not an _independent_ correctness
   oracle. This is the clearest, most reproducible skill defect.
2. **eval-10 / eval-11 are the weakest with the skill on both models** (Date-allocation
   note missing; `[Date, nanoseconds]` split only partial, no `Nanoseconds` alias / P3-vs-P9 note).

## Findings that differ from the Opus run

- **Holey-array rule (eval-20):** on Sonnet the with-skill run correctly used `[]`+push
  (1.00) while no-skill used `new Array(n)` (0.50) — here the skill _helped_. On Opus both
  used `new Array(n)` and tied at 0.83. The rule is followed inconsistently across
  models; tightening the large-vs-count-known guidance would make it reliable.
- **TypeScript-default:** Sonnet-with-skill followed it better than Opus-with-skill
  (emitted `.ts` on the optimization evals 21/23), so the "TS by default" gap is
  more an Opus-with-skill issue.

## Caveats

- LLM-graded against assertions; no live-server ground truth.
- 1 run per (eval, config) — per-eval deltas are point estimates.
- Non-discriminating evals on Sonnet (tie at 100%): 7, 8, 13, 14, 15 — fewer than the
  Opus run, i.e. the eval set discriminates skill value more sharply at Sonnet's level.

_Raw gradings, `benchmark.json`, and the interactive `review.html` (with the Opus run as
the "previous" comparison) live in the sibling `…-workspace/iteration-2/` directory._
