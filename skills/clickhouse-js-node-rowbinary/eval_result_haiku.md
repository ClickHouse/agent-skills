# Eval result (Haiku) — RowBinary skill (26 evals, with-skill vs no-skill)

**Date:** 2026-06-22
**Model:** Claude Haiku 4.5 — `claude-haiku-4-5` (executors). Grader: Claude Opus 4.8 — `claude-opus-4-8[1m]` (held constant as the measurement instrument, same as the [Opus](eval_result.md) and [Sonnet](eval_result_sonnet.md) runs).
**Harness:** Claude Code Workflow (background `pipeline`) — a 52-cell generate→grade pipeline (26 evals × {with-skill, no-skill}); 104 subagents total, ~1.94M subagent tokens, ~296s wall.
**Method:** same A/B as the Opus/Sonnet runs — for each eval in [`evals/evals.json`](evals/evals.json) an isolated **Haiku** subagent generated a parser **with the skill** and a **no-skill control** (instructed not to read repo files), scored by an **Opus** grader against the eval's assertions (1 = met, 0.5 = partial, 0 = miss/violation; overall = mean). 1 run per cell; no live-ClickHouse ground truth (use [`skill-bench`](.claude/skills/skill-bench/SKILL.md) for server truth). This run covers **26** evals — the original 24 plus the two columnar streaming cases (24, 25) added after the Opus/Sonnet runs; a 0–23 subset is reported below for apples-to-apples cross-model comparison.

## Headline

| Metric                        | With skill | Without skill | Delta     |
| ----------------------------- | ---------- | ------------- | --------- |
| Pass rate (26 evals)          | **86.2%**  | 53.2%         | **+33pp** |
| Pass rate (0–23 subset)       | **86.0%**  | 52.2%         | **+34pp** |
| Wall time / tokens (per cell) | N/A        | N/A           | —         |

**On Haiku the skill is worth +33pp** — it lifts a weak 53% unaided baseline to 86%. The delta matches Sonnet's (+34pp) and is larger than Opus's (+23pp), for the same reason the Sonnet run gave: the skill mostly closes the _baseline_ gap. But unlike Sonnet, **Haiku-with-skill does not reach the Opus/Sonnet with-skill ceiling** (86% vs ~94%) — Haiku sometimes can't faithfully _apply_ the skill on the hardest cases (it emits prose instead of code on eval-18, and silently drops the skill's signature no-bigint trick on eval-25). Per-cell wall/token are N/A: the Workflow harness reports run-level totals only, not the per-cell `stream-json` the Sonnet run used.

## With-skill vs without-skill by eval (Haiku)

| Eval                                              | With     | Without  | Δ         |
| ------------------------------------------------- | -------- | -------- | --------- |
| 0 fixed-width numerics (Buffer)                   | 0.80     | 0.60     | +0.20     |
| 1 DateTime64(3)/Float32 endianness                | 1.00     | 1.00     | 0         |
| 2 varint length reader                            | **1.00** | **0.00** | **+1.00** |
| 3 Int64/Int128 precision                          | 1.00     | 1.00     | 0         |
| 4 Buffer slice / DataView windowing               | 1.00     | 0.40     | +0.60     |
| 5 Decimal64/IPv4 format separation                | 0.92     | 0.25     | +0.67     |
| 6 UUID byte-order                                 | 1.00     | 0.90     | +0.10     |
| 7 FixedString / binary String                     | 0.83     | 0.00     | +0.83     |
| 8 BFloat16 array                                  | 1.00     | 0.90     | +0.10     |
| 9 Enum8 underlying int                            | 0.92     | 0.75     | +0.17     |
| 10 Date/DateTime tz metadata                      | 0.80     | 0.50     | +0.30     |
| 11 DateTime64(9) nanoseconds                      | 0.80     | 0.20     | +0.60     |
| 12 Time/Time64 durations                          | 0.90     | 0.00     | +0.90     |
| 13 LowCardinality/SimpleAggregateFunction         | 1.00     | 0.58     | +0.42     |
| 14 Variant discriminant name-sort                 | 1.00     | 0.70     | +0.30     |
| 15 Nested = Array(Tuple)                          | 0.83     | 0.50     | +0.33     |
| 16 AggregateFunction opaque state                 | **1.00** | **0.00** | **+1.00** |
| 17 Dynamic runtime dispatch                       | 1.00     | 1.00     | 0         |
| 18 Dynamic nested type-headers                    | **0.25** | **0.42** | **−0.17** |
| 19 JSON = paths + Dynamic                         | 0.67     | 0.08     | +0.58     |
| 20 hot UUID/IPv6/Array zero-copy                  | 0.67     | 0.67     | 0         |
| 21 Float32 array benchmark                        | **0.33** | **0.83** | **−0.50** |
| 22 documented String/Int64 toggles                | 0.92     | 0.58     | +0.33     |
| 23 Array(Tuple) monomorphized                     | 1.00     | 0.67     | +0.33     |
| 24 streaming columnar (sensor, no per-row bigint) | 0.93     | 0.71     | +0.21     |
| 25 streaming columnar (trades, 2×64-bit)          | 0.86     | 0.58     | +0.27     |

## Haiku vs Opus vs Sonnet (grader = Opus 4.8, 0–23 subset)

| Executors      | With skill | Without skill | Delta |
| -------------- | ---------- | ------------- | ----- |
| **Opus 4.8**   | 94.7%      | 71.5%         | +23pp |
| **Sonnet 4.6** | 94.0%      | 60.4%         | +34pp |
| **Haiku 4.5**  | 86.0%      | 52.2%         | +34pp |

Haiku's _unaided_ baseline is the weakest of the three (52.2%), and the skill rescues it by the same magnitude it rescues Sonnet — but the **with-skill ceiling is ~8pp below** Opus/Sonnet. Two things hold Haiku-with-skill back that don't hold the bigger models back:

- **eval-18 Dynamic nested type-headers — 0.25, a regression below its own no-skill 0.42.** With the skill, Haiku produced _prose describing_ the header layout but almost no decoding code; the no-skill cell at least emitted (wrong) code that scored partial. Haiku couldn't operationalize the skill's most complex section.
- **eval-25 columnar trades — with-skill **violated** the headline no-per-row-bigint expectation.** Haiku read both 64-bit columns with `getBigInt64`/`getBigUint64` per row instead of the two-`getUint32`-words-into-a-`Uint32Array`-view trick — exactly the manual finding from the case-25 spot-check. It adapted the schema (stride 29, `BigUint64Array`, offsets) correctly but dropped the optimization the moment it couldn't copy it verbatim.

## Findings that reproduce across ALL THREE models (highest-priority skill fixes)

1. **eval-21 (float32 benchmark) regression — Haiku 0.33 vs 0.83 no-skill.** Identical shape to Sonnet (0.33 vs 0.83) and Opus (0.67 vs 0.83): the with-skill run times the two decoders without an equivalence check, no disqualification statement, no runnable test. **This defect now reproduces on every model tested** — the skill teaches equivalence-before-timing but doesn't make the agent actually wire up the guard. Clearest, most reproducible skill defect.
2. **eval-10 / eval-11 are among the weakest with the skill (0.80 / 0.80).** Same gaps as Opus/Sonnet: the per-`Date` allocation note is missing (10), and the `[Date, nanoseconds]` split / `Nanoseconds` alias / P3-vs-P9 note is only partial (11).

## Findings specific to the Haiku run

1. **No-skill _refusals_, not just wrong answers.** eval-7 (FixedString/binary String) and eval-12 (Time/Time64) scored **0.00 no-skill because Haiku refused / emitted no code**; eval-12 also asserted the types are unsigned. The skill turns both into 0.83 / 0.90. Weaker models don't just guess wrong unaided — they sometimes don't attempt the decoder at all.
2. **The skill's signature optimization doesn't fully transfer to Haiku.** On the two new columnar evals the no-bigint word-copy trick is **skill-exclusive** (no-skill Haiku used `readBigInt64LE` per row on both 24 and 25), but even _with_ the skill Haiku reproduced it only on the matching schema (eval-24, raw ticks kept) and dropped it on the novel two-64-bit schema (eval-25). This is the inverse of a strong model: Opus/Sonnet-with-skill carried the trick to the new schema; Haiku needs the example to match.
3. **Faithful where the skill is concrete and copyable.** eval-2 (varint), eval-16 (AggregateFunction = don't decode), eval-13 (transparent wrappers), eval-23 (monomorphized Array(Tuple)) all hit 1.00 with skill from 0.00–0.67 without — Haiku reliably reproduces well-scoped, single-pattern guidance.

## Caveats

- LLM-graded against assertions; no live-server ground truth (same as the Opus/Sonnet runs).
- 1 run per (eval, config) — per-eval deltas are point estimates; Haiku's no-skill refusals (7, 12) may not reproduce every run.
- Per-cell wall-time/token metrics unavailable in the Workflow harness (run-level only: 104 agents, ~1.94M subagent tokens, ~296s wall).
- No-skill isolation relied on a prompt instruction not to read repo files (not sandbox-enforced); a peeking agent could have seen `evals.json`. Same method caveat as the Sonnet run.
- Cross-model headline uses the **0–23 subset** so it matches the 24-eval Opus/Sonnet runs; the 26-eval figure (86.2% / 53.2%) includes the two columnar cases.
- Non-discriminating evals on Haiku (tie): 1, 3, 17 (tie at 100%), 20 (tie at 0.67) — and two with-skill **regressions** (18, 21), more than Sonnet had.
