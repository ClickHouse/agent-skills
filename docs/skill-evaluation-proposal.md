# Proposal: evaluate skill changes outside this repository

**Status: design only.** This PR changes skills and static validation; it does not implement a model-evaluation runner or claim better model performance. Build the harness in a separate project, run it against pinned revisions, and attach its results to this draft PR before deciding which skill commits to merge.

## Questions to answer

1. Does the candidate improve task completion or remove a concrete failure relative to the existing skill?
2. Does either skill improve on the same model with no skill?
3. Are narrower activation and selective reference reads reducing unnecessary work without losing useful domain knowledge?
4. Do changes preserve result semantics, protocol correctness, existing resources and task authorization?
5. Does the result hold across the models and agent environments people actually use?

Smaller Markdown files are a hypothesis about context efficiency, not a quality metric. Measure tokens actually loaded, tool calls, completion and correctness.

## Experimental arms

| Arm | Skill content | Purpose |
| --- | --- | --- |
| No skill | No repository skills, descriptions or compiled skill guides | Measure the model's existing capability |
| Baseline | `ClickHouse/agent-skills` at `2f6ec4b17a81a435dd116f9ac19d7b45d44dbd61` | Current upstream before this PR |
| Candidate | Exact PR head SHA recorded at run start | Evaluate the proposed changes |
| Single-skill candidate | Baseline plus one selected skill commit | Support cherry-picking and identify which change caused a result |

Freeze the baseline; do not use moving `main`. Resolve the candidate once, recording both Git SHA and content hashes. If the PR changes, keep old results attached to the old SHA and rerun affected cases.

For primary per-skill comparisons, expose just the selected skill in baseline and candidate, with identical non-skill fixtures. For a separate discovery suite, expose the full catalog to test overlap. In a single-skill catalog ablation, keep other skills at baseline. Install skill directories explicitly rather than using the root plugin bundle: that bundle does not currently include every repository skill.

Run two distinct modes:

- **Discovery:** provide the normal user request plus available names/descriptions. Observe which skill and references the agent actually selects. Include positive and negative activation cases.
- **Execution:** explicitly load the selected skill's `SKILL.md` and make its referenced assets available. This isolates instruction quality from skill selection. Give the no-skill arm the same task without the skill. Execution mode cannot establish activation precision.

Use a fresh agent workspace per trial. Exclude personal/global skills, memory, previous transcripts, repository maintainer `AGENTS.md`, and candidate eval rubrics from the model's task context. Preserve identical fixture project instructions across arms. Skill-owned `AGENTS.md` files are available only inside that arm's skill package and should not be automatically applied as workspace instructions. Log the actual files and descriptions injected or read so contamination is detectable.

## Models and run budget

Start with GPT-6 Astra and Claude Fable 5.1, plus the lower-cost model used by the intended installation audience. Record exact provider model identifiers/snapshots, agent runtime version, system prompt hash, effort, output limits, tools and tool schemas, compaction policy and dependency/image versions. Treat runtime/model combinations as separate strata: a different host prompt or tool implementation can explain an apparent model difference.

Keep settings fixed across arms within each stratum. Do not assume identically named effort levels are equivalent across providers. Add an effort sweep only as a separate experiment after the initial comparison. Avoid adding provider-specific behavior patches to the skills solely to win one run.

Suggested first pass: three scenarios per skill (positive, counterexample and negative/continuation), three repetitions, three arms, two models: **594 trials**. This is a pilot for finding failures, not enough evidence for narrow statistical claims. Start with one skill to validate the harness and estimate cost before scheduling the full matrix. Expand task diversity and repetitions for borderline outcomes, using a held-out set before a merge recommendation.

Before execution, calculate a budget from a small calibration sample and current provider pricing. Set a run-wide cost cap, per-task token/tool/time limits and bounded tool retries. Separate provider/infrastructure failures from agent failures; report all excluded and retried trials. Use the same cache policy across arms and record cached tokens rather than assuming shorter prompts are cheaper.

## Proposed external project layout

```text
clickhouse-skill-evals/
  experiments/          # pinned revisions, model/runtime settings, budgets
  scenarios/<skill>/    # task messages, fixtures, assertions and rubrics
  fixtures/             # synthetic databases, API schemas, metrics, client projects
  adapters/             # provider/agent drivers and skill discovery/loading
  tools/                # stateful fake CLI/API/collector surfaces
  graders/              # deterministic checks plus blind rubric review
  results/<run-id>/     # manifest, per-trial trace, artifacts, scores, report
```

The runner should implement this contract:

1. Validate the experiment/scenario manifest, resolve revisions and hash all inputs.
2. Create isolated workspaces with identical fixtures and the selected arm's skills.
3. Run the task through the selected agent adapter with instrumented tools.
4. Capture final artifacts, observable state changes, file reads, tool requests/results, user questions, timings and usage. Store only synthetic credentials in traces.
5. Grade deterministic outcomes, then send anonymized outputs/traces to the rubric grader without arm labels. Keep assertions inaccessible to the task agent.
6. Emit per-case scores and a paired comparison report with links to traces.

For interactive cases, define a deterministic user-response script shared across arms: which question gets which answer, and when follow-up authorization arrives. Do not let a simulator give one arm extra hints. Unnecessary questions count as friction, while necessary missing-input questions are correct behavior. A requested approval that never arrives must not be simulated as granted by a timeout.

Fake tools should implement state transitions and bounded API failures, not just fixed command transcripts. For example, a service-creation timeout may leave the service created; a retry should observe it. Record attempted prohibited actions even when the fake tool refuses them. No fake credentials or endpoints may connect to production. Use disposable local databases for semantic/integration fixtures; a separate opt-in suite can later exercise disposable cloud infrastructure with a budget and cleanup ownership tracking.

## Example scenario contract

The following is illustrative YAML for the future runner, not an installed command or executable suite. The named grader IDs describe functionality to implement.

```yaml
id: best-practices.null-is-not-zero
skill: clickhouse-best-practices
mode: execution
messages:
  - role: user
    content: |
      Review this type choice for performance; do not edit files or connect.
      Unknown revenue must remain distinct from a genuine zero, and AVG
      should exclude unknown observations. Should revenue be non-nullable?
      CREATE TABLE sales (id UInt64, revenue Nullable(Float64))
      ENGINE = MergeTree ORDER BY id;
fixture:
  network: disabled
  workspace_files: {}
  tools: []
expected_behavior:
  - Preserve the distinction between unknown and zero.
  - Explain why removing Nullable or replacing NULL with zero changes AVG.
  - Give a scoped recommendation from the supplied DDL and semantics.
hard_failures:
  - Recommend replacing NULL with zero without preserving unknown semantics.
  - Claim to have run a query or benchmark.
graders:
  - id: no_tool_or_file_side_effects
  - id: blinded_domain_rubric
    dimensions: [correctness, scope, evidence, completion]
```

For a query-rewrite variant, give the agent a file to edit and execute original and candidate queries on synthetic rows containing null, zero and nonzero values. Use an independent expected result and typed comparison, including ordering only when the query contract specifies it. Checking for the word `Nullable` would not establish correctness.

## Initial scenario bank

Each row below proposes a positive case, a counterexample, and a negative or continuation case. Turn them into separate scenario files and freeze the actual input data before running. Add held-out wording and schema variants that were not used to author the skills.

| Skill | Positive case | Counterexample / boundary | Negative activation or continuation |
| --- | --- | --- | --- |
| `clickhouse-best-practices` | Review supplied DDL and a slow query; select relevant rules and preserve results | NULL vs zero; highly selective key vs lowest-cardinality-first; 50k repeated string values; full-history aggregate must not gain a time filter | Explain one SQL expression without connecting, reading all rules or producing a full compliance report |
| `chdb-datastore` | Use existing DataStore for a file aggregation; materialize and verify the result | Compare pandas migration with index alignment, nulls and a fallback operation; measure before claiming compatibility or speed | Fix an existing pandas transformation without installing or migrating to chDB |
| `chdb-sql` | Use the existing Session or DB-API path with typed parameters and appropriate connection lifetime | Repeated calls need persistent state; cannot treat ephemeral queries as a persistent database | Answer ordinary Postgres SQL without switching the engine or installing chDB |
| `clickhouse-architecture-advisor` | Recommend ingestion/enrichment for a workload with latency, volume and freshness constraints | Mutable dimension and duplicate keys make a dictionary or ANY JOIN change semantics; later source corrections do not automatically retract an incremental MV | Answer a narrow tradeoff directly; produce a structured review only when requested |
| `clickhouse-js-node-coding` | Add a typed query parameter in the existing Node client, preserving project conventions | Pinned client version lacks an API in a newer reference; use installed types/docs | Browser client task should not receive Node-only configuration or an unrelated client rewrite |
| `clickhouse-js-node-troubleshooting` | Diagnose a reproducible reset with supplied version, logs and config | Uncertain insert outcome must not cause blind retry; a reset is not proof keep-alive is the cause | User already supplied all diagnostic fields; do not ask for the same information again |
| `clickhouse-js-node-rowbinary` | Implement a requested reader or writer for a fixed schema and verify byte/value round trips | Chunk boundaries, truncated buffers, nullable values and wide integers; whole-buffer input does not imply valid framing | Explicit RowBinary requirement stays RowBinary; routine JS integration need not become a bespoke TS optimization project |
| `clickhouse-managed-postgres-rca` | Correlate metrics and slow patterns for the supplied incident window | Empty patterns, reset counters, unavailable metrics or many blocks per aggregate row do not establish a healthy system or a full scan | First diagnose without writes; later explicit implementation authorization may enter an implementation workflow with adequate schema/plan evidence |
| `clickstack-otel-collector` | Merge an exporter into a supplied existing collector and verify the requested signal | Existing ingest credentials/container must survive a retry; old table rows do not prove this run arrived | Configuration-only request must not deploy Docker, rotate passwords or emit a multi-service synthetic demo |
| `infra-clickhouse` | Provision a requested local server at a pinned version, or migrate schema to a specified Cloud service | Creation times out after success; inspect state before another create; `IF NOT EXISTS` is not a migration | Existing app query task does not install a server, open an account or change the selected deployment |
| `infra-postgres` | Connect to a specified managed service with existing credentials and verified TLS | Existing password, `.env` target and pinned local version must survive connection setup; CA download alone is not TLS verification | Generic Postgres or third-party managed database task must not move to ClickHouse Cloud; later explicit deletion targets only the named instance |

A single prompt should test a coherent task, not every condition in a row. Prioritize the highest-risk condition for the three-case pilot and expand the rest into the regression suite. Add a full-catalog discovery suite for ambiguous queries that could trigger multiple skills. A complete architecture review is a positive control: slimming the skill must not prevent thoroughness when requested.

## Grading and decision rules

Use deterministic checks wherever the result has an independent oracle: SQL result equivalence, compiled client code, codec bytes and values, preserved files/config, tool state and attempted actions. Syntax validation alone is insufficient. For architecture or RCA, score the recommendation against supplied evidence and a domain-expert-reviewed rubric; accept multiple valid solutions.

Use four rubric dimensions, each 0–2: domain correctness, scope/semantics, evidence/uncertainty, and requested completion. Write scenario-specific anchors for 0, 1 and 2 before reviewing outputs. Do not grade exact phrases, headings, mandatory citations to a skill, or similarity to its example answer. Calibrate automated judgments against blinded human review and inspect disagreements and changed pass/fail outcomes.

Hard failures are separate from the aggregate rubric: changed requested semantics, invented measurements, leaked synthetic secrets, unauthorized mutation, or damage to an unrelated resource. Candidate-only hard failures block the affected skill pending investigation even when average scores or token use improve. Baseline failures also need investigation; the baseline is a comparator, not the quality bar.

Report paired differences on the same scenarios, by skill and model/runtime, rather than one repository-wide score. Include trial counts, failures, unresolved cases and uncertainty. With a larger suite, bootstrap over scenario clusters (keeping repeated trials together) for confidence intervals; do not treat many repetitions of one prompt as independent task diversity. Predeclare any acceptable regression margin and latency/cost tradeoff before looking at final results.

Suggested initial decision: accept a skill only when its identified failures are addressed, no unresolved candidate-only hard failure remains, and held-out completion/correctness has no material regression. Lower tokens or fewer tool calls strengthen that case only after quality is acceptable. “Inconclusive; expand the sample” is a valid result. Different outcomes by model may justify retaining more explicit domain guidance; they do not justify claiming a universal improvement.

## Running it later

The command names below are a proposed interface for the separate project; **they do not exist in this repository**:

```text
skill-evals validate experiments/skill-refresh.yaml
skill-evals estimate experiments/skill-refresh.yaml
skill-evals run experiments/skill-refresh.yaml --skill clickhouse-best-practices
skill-evals run experiments/skill-refresh.yaml --resume <run-id>
skill-evals compare <run-id> --baseline baseline --candidate candidate
skill-evals report <run-id> --format markdown
```

Implement the one-skill pilot first, review traces and grader reliability, then expand to all skills and discovery mode. Resume should reuse completed trial IDs and input hashes, never mix outputs from changed manifests. Test the harness and graders using deliberately faulty fixture agents before spending on a full model run.

The result manifest should include run ID/date, baseline/candidate SHA, scenario and fixture hashes, skill/package hashes, model/runtime/settings, tool schema hash, grader version, trial IDs, finish/error reasons, completion/hard-failure results, each rubric score, input/cached/output tokens, cost, duration, tool-call count, clarification count and skill files/bytes actually read. Store provider-reported usage and price date separately from calculated cost. Mark unavailable metrics as unavailable, not zero.

Return a report to this PR with:

| Skill / model / mode | Baseline pass | Candidate pass | No-skill pass | Candidate-only hard failures | Cost / latency change | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| To be measured | — | — | — | — | — | Pending evals |

Link every regression and representative improvement to an immutable trial artifact. Include the exact commit to cherry-pick for each recommended skill and state whether the result came from an isolated skill or full catalog. Keep results in the external project; a later PR comment can link the report and summarize the merge recommendation. Historical RowBinary evaluation reports in this repo are useful background, but their missing external fixtures and different experiment setup make them unsuitable as this baseline.

## Guidance used

These references motivate the changes and experiment, but do not establish that this PR improves behavior:

- [OpenAI: Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) (September 11, 2026): concise activation descriptions, task-relevant reference loading, revisiting rigid recipes and permission boundaries, and accounting for different models.
- [Anthropic: The new rules of context engineering for Claude 5 generation models](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models): simplify conflicting constraints, use progressive disclosure, and retain product/team-specific knowledge.
- [Anthropic: Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices): evaluate real gaps against a no-skill baseline and iterate. It recommends evaluations before extensive changes; this PR deliberately follows the requested changes-first, external-evals-later sequence, so behavioral benefits remain unverified.
- [Anthropic: Prompting Claude Fable 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5): model-specific prompting background for the audit.
- [Anthropic: Prompting Claude Fable 5.1](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1): newer guidance on task completion, targeted edits and effort tradeoffs. Treat agent-harness recommendations separately from portable database skills.

References reviewed September 12, 2026. Recheck model availability and pricing when implementing the runner.
