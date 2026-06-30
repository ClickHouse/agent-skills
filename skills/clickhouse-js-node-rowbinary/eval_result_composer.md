# Eval result (Composer) — RowBinary skill (skill-bench orders, with-skill vs no-skill)

**Date:** 2026-06-21
**Model:** Composer 2.5 Fast — `composer-2.5-fast` (executors). No separate grader — correctness scored against live ClickHouse server output (same fixture procedure as [`skill-bench`](.claude/skills/skill-bench/SKILL.md)).
**Harness:** Cursor Task subagents (isolated work dirs under `/tmp/rb-skill-bench/orders/`)
**Method:** The [`skill-bench` orders contract](.claude/skills/skill-bench/SKILL.md) — one fixed schema (`UInt8`, `UUID`, `Decimal64(2)`, `Enum8`) — run as a 2×1 matrix (Composer with-skill vs no-skill). Fixture bytes and expected fields built from a live ClickHouse server (64 rows); throughput measured on a 64×400 = 25,600-row concatenated buffer (equivalence-checked, best of 5 rounds). 1 run per cell. This is **server-truth** scoring, not the 24 LLM-graded evals in [`evals/evals.json`](evals/evals.json) (see [Sonnet](eval_result_sonnet.md) / [Opus](eval_result.md) for those).

## Headline

| Metric                    | With skill       | Without skill | Delta     |
| ------------------------- | ---------------- | ------------- | --------- |
| Correctness (64 rows)     | **100%**         | **100%**      | 0         |
| Generated-code throughput | **14.0M rows/s** | 5.8M rows/s   | **2.40×** |
| Parser size               | 99 lines         | 49 lines      | +50 lines |
| Agent wall time           | N/A              | N/A           | —         |
| Output tokens             | N/A              | N/A           | —         |

**Both cells decoded every field correctly** against what ClickHouse itself produced — including the three classic traps this schema is chosen for (UUID byte order, Decimal64 fixed scale, Enum8 underlying int). The skill's lift on Composer is **throughput and optimization patterns**, not correctness on this run: the no-skill parser got UUID/decimal/enum right without peeking at the skill.

## With-skill vs without-skill by trap (orders schema)

The orders skill-bench task exercises the same gotchas several evals target individually:

| Trap                                                        | Eval analogue     | With skill       | Without skill | Δ                    |
| ----------------------------------------------------------- | ----------------- | ---------------- | ------------- | -------------------- |
| UUID two-LE-halves byte order                               | eval-6            | ✓ 64/64          | ✓ 64/64       | tie                  |
| Decimal64(2) → exactly 2 fractional digits                  | eval-5            | ✓ 64/64          | ✓ 64/64       | tie                  |
| Enum8 → underlying int (1/2/3), not name                    | eval-9            | ✓ 64/64          | ✓ 64/64       | tie                  |
| Hot-path codegen (lookup table, bigint decimal, row stride) | eval-20 / eval-23 | **14.0M rows/s** | 5.8M rows/s   | **+140% throughput** |

## Composer vs Sonnet (skill-bench orders, same fixture shape)

Cross-run comparison uses the same orders contract and scoring rules; Sonnet numbers are from the prior claude-CLI skill-bench cell in [`.claude/skills/skill-bench/results/orders/`](.claude/skills/skill-bench/results/orders/).

|                                         | With skill     | Without skill | Skill throughput lift |
| --------------------------------------- | -------------- | ------------- | --------------------- |
| **Composer 2.5 Fast**                   | ✓ 14.0M rows/s | ✓ 5.8M rows/s | **2.40×**             |
| **Sonnet 4.6** (no-skill only recorded) | —              | ✓ 8.0M rows/s | —                     |

Composer-no-skill is **slower** than Sonnet-no-skill on this one run (5.8M vs 8.0M rows/s) despite equal correctness — the Sonnet baseline used a tighter hand-rolled loop, while Composer-no-skill used `readUInt32LE`/`readInt32LE` for decimal and string-built UUID hex. Composer-with-skill more than closes that gap and beats Sonnet-no-skill by **1.76×** on generated-code speed.

## Where the skill clearly earned its keep (Composer)

Correctness gaps the skill closes on weaker models (see [Sonnet eval-6 at 0.20](eval_result_sonnet.md)) did **not** appear here — Composer-unaided passed server truth. What the skill _did_ deliver:

- **`formatUUIDTable` lookup-table path** — adapted from the orders example (`src/examples/orders.ts` / skill UUID guidance) instead of per-byte string concatenation in the no-skill cell.
- **Bigint + `DataView.getBigInt64` decimal path** — faithful signed Int64 unscaled units with scale-2 padding; no-skill used JS number arithmetic on 32-bit limbs.
- **Flattened 26-byte fixed row** — single stride (`1 + 16 + 8 + 1`), pre-sized `new Array(rowCount)`, column comments — the "flatten the assembled row reader" tier from `SKILL.md`.

**Isolation audit (no-skill):** clean — hand-rolled `formatUUID` with per-half byte reversal, no `formatUUIDTable` / `UUID_HEX16` / skill module names; verified the agent did not read paths under `skills/clickhouse-js-node-rowbinary-parser-generator`.

## Findings specific to this Composer run

1. **Composer-unaided correctness on orders is strong.** One run, but both UUID and decimal formatting matched ClickHouse `toString()` output — unlike Sonnet-no-skill on eval-6 (0.20 pass rate across the 24-eval suite). Skill-bench still recommends multiple no-skill trials before claiming stability; this run is a point estimate only.
2. **Skill value here is performance, not rescue.** The 2.40× throughput gap is the headline; the skill cell is also ~2× the line count because it inlines the optimized UUID table and bigint formatters.
3. **Agent cost not measured.** Cursor Task subagents do not emit the `stream-json` transcript the claude-CLI skill-bench procedure uses for turns/tokens/USD — only generated-code metrics are reported.

## Findings that align with the Opus / Sonnet eval runs

These skill-bench observations are consistent with themes from the 24-eval A/B runs, even though Composer did not execute that suite:

- **Gotcha types are where no-skill breaks on weaker models** — Composer passed this small schema; Sonnet's 24-eval no-skill pass rate was 60.4% with UUID/JSON/AggregateFunction as the big holes.
- **Optimization tier is not automatic without the skill** — no-skill Composer reached for readable `Buffer.read*LE` helpers; with-skill reached for the benchmarked hot path. Same pattern as eval-23 (monomorphized / inlined) and eval-20 (zero-copy / packed arrays).
- **The orders schema is a weak correctness discriminator for strong models** — both Composer cells correct; the schema discriminates **code quality and speed** instead (as [`skill-bench` expects](.claude/skills/skill-bench/SKILL.md) for Sonnet-no-skill UUID flakiness, not for every model).

## Caveats

- **Server-truth scoring on one schema**, not the 24 LLM-graded evals — for assertion-level coverage across all type families, see [eval_result_sonnet.md](eval_result_sonnet.md) and [eval_result.md](eval_result.md).
- **1 run per (cell)** — per-cell results are point estimates; Sonnet-no-skill UUID failure is non-deterministic across runs.
- **Agent cost metrics unavailable** in the Cursor Task harness (wall time, turns, tokens, USD all N/A).
- **Cross-model throughput comparison is provisional** — Sonnet-no-skill is from a different fixture build (fresh INSERT each run); row bytes differ, but schema and scoring rules match.

_Raw parsers, fixture, and machine-readable scores: [`.claude/skills/skill-bench/results/orders/`](.claude/skills/skill-bench/results/orders/) (`composer-{noskill,skill}.parser.mjs`, `fixture.json`, `results.json`, `report.md`). Work dirs: `/tmp/rb-skill-bench/orders/composer-{noskill,skill}/`._
