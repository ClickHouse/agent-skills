# ClickHouse Managed Postgres RCA

Version 0.2.0. Optional compilation; the source instructions are [SKILL.md](SKILL.md) and the individual rules. For focused work read only the relevant source file.

- [openapi-discovery](rules/openapi-discovery.md)
- [prometheus-scrape](rules/prometheus-scrape.md)
- [slow-query-patterns-fields](rules/slow-query-patterns-fields.md)
- [triage](rules/triage.md)
- [heuristic-full-scan](rules/heuristic-full-scan.md)
- [heuristic-hot-loop](rules/heuristic-hot-loop.md)
- [heuristic-write-congestion](rules/heuristic-write-congestion.md)
- [output-template](rules/output-template.md)
- [recommend-only](rules/recommend-only.md)

---

# OpenAPI discovery

Both endpoints this skill uses are **Beta**. Field names and
paths may shift. Before constructing any requests, resolve the
current shape from the live OpenAPI spec.

## Discovery and reuse

Fetch the OpenAPI document at `https://api.clickhouse.cloud/v1` when no verified mapping is available. Locate the operations below and resolve their parameter/response schemas. Reuse a mapping established in this session or a recent cache that records the spec URL and fetch timestamp; do not rediscover it for every request.

If caching, store only schema metadata, not credentials or response data, in a task-specific location. A 24-hour cache is a convenience, not a freshness guarantee. Refresh when the user requests it or a response indicates schema drift; ordinary authentication or invalid-value errors need their own diagnosis.

## Operations to locate

- **`slowQueryPatternsGetList`** (tag: Postgres) — list slow
  query patterns for a Postgres service.
- **`postgresInstancePrometheusGet`** (tag: Prometheus) —
  scrape Prom for a Postgres service.

Find them by `operationId`, not by path. Paths may move
between spec versions; operation IDs are the stable contract.

## What to extract per operation

From the matched `paths` entry:

- The HTTP path template (e.g.
  `/v1/organizations/{organizationId}/postgres/{postgresId}/...`).
- Path parameter names — typically `organizationId` and a
  Postgres-service ID (current spec calls it `postgresId`).
- Required query parameters. The slow-query endpoint
  currently requires `from_date` and `to_date` (ISO 8601 UTC).

From the `responses['200'].content['application/json'].schema`
(follow `$ref` into `components.schemas`):

- For `slowQueryPatternsGetList`: the response envelope wraps
  `result: array of <PatternSchema>`. Walk into the
  `<PatternSchema>` `properties`.

For `postgresInstancePrometheusGet`, the response is
`text/plain` in Prometheus exposition format. There's no JSON
schema; field discovery for Prom happens by scraping the
endpoint and reading the metric names directly.

## Build a role map for the slow-query schema

For each property in the resolved pattern schema, identify its
**semantic role** from the `description` field, not from the
name. Build a session-scoped map `{ role: actual_field_name }`.

Roles to identify:

| Role | Identify by description containing |
|---|---|
| `query_id` | "identifier for the query pattern" |
| `query_text` | "normalized query text" |
| `db_operation` | "SQL operation type" / "SELECT, INSERT, ..." |
| `call_count` | "Number of times the pattern executed" |
| `error_count` | "executions ... that raised an error" |
| `total_duration` | "Total execution time across all calls" |
| `avg_duration` | "Average execution time per call" |
| `max_duration` | "Maximum execution time" |
| `p50` / `p95` / `p99` | "percentile execution time" |
| `total_rows` | "rows returned or affected" |
| `blocks_read_from_disk` | "blocks read from disk" / "cache misses" |
| `blocks_served_from_cache` | "blocks hit" / "cache hits" |
| `total_cpu_time` | "Total CPU time" |
| `total_wal_bytes` | "WAL" / "write-ahead log" |

When you reference these in your reasoning, use the **resolved
actual name** (e.g., the spec's current camelCase or snake_case
spelling), not the role.

## Spotting drift

If you can't find a property whose description matches a role:

- Note it explicitly: "Role `blocks_served_from_cache`: no
  matching field in the current spec."
- Proceed with the diminished signal (e.g., for full-scan
  detection, fall back to disk-reads only — but flag the
  ambiguity in the recommendation).
- Don't guess at field names. Unresolved roles are real gaps.

## Reference: May 2026 spec snapshot

For sanity-checking only. The live spec is authoritative.

```
call_count               -> callCount
error_count              -> errorCount
total_duration           -> totalDurationUs
avg_duration             -> avgDurationUs
max_duration             -> maxDurationUs
p50 / p95 / p99          -> p50DurationUs / p95DurationUs / p99DurationUs
total_rows               -> totalRows
blocks_read_from_disk    -> totalSharedBlksRead
blocks_served_from_cache -> totalSharedBlksHit
total_cpu_time           -> totalCpuTimeUs
total_wal_bytes          -> totalWalBytes
query_text               -> queryText
db_operation             -> dbOperation
```

Use the live spec or a verified recent mapping; this historical snapshot is not a substitute for discovery.

---

# Prometheus scrape

## How

Use the path resolved during OpenAPI discovery
(`postgresInstancePrometheusGet`). HTTP Basic with the user's
ClickHouse Cloud API key/secret.

```bash
curl -s -u "$CH_CLOUD_KEY:$CH_CLOUD_SECRET" \
  "https://api.clickhouse.cloud/<resolved path>" > /tmp/pg-prom.txt
```

The response is Prometheus exposition format text (lines like
`PostgresServer_X{...} <value>`).

## Default: one scrape, gauges only

The skill's default Prom step is **a single scrape** that
extracts current values from gauges. No wait, no second scrape.
The Slow Query Patterns API gives the per-pattern rate-of-change
data — see `slow-query-patterns-fields.md` — so the only role
left for Prom is system-level context.

Gauges to read on the single scrape:

- `PostgresServer_CacheHitRatio` — current ratio. Below ~95%
  on a workload that should fit in cache can suggest cache pressure; it is not a diagnosis by itself.
- `PostgresServer_ActiveConnections` — current count (often
  split by `state` label: active / idle / idle in transaction).
  Climbing toward a known pool ceiling = client fan-out or
  stuck queries.
- `PostgresServer_MemoryUsedPercent` — current. Helps qualify
  cache hit ratio; low memory utilization plus misses does not alone prove the workload exceeds RAM.
- `PostgresServer_FilesystemUsedPercent` — current. High =
  storage pressure, separate concern from query latency.

## Opt-in: rate-of-change from two scrapes

Only do a second scrape when Step 4 triage hints at write
congestion or you need a signal that's nowhere else:

- `PostgresServer_Deadlocks_Total` — non-zero delta means
  lock-cycle deadlocks: Postgres detected a circular lock wait
  and aborted one transaction to break it. This is **not** the
  same as a serialization conflict (SQLSTATE 40001 under
  `SERIALIZABLE` / `REPEATABLE READ`) — different mechanism,
  different fix (consistent lock ordering vs. retry/isolation
  review). See sub-patterns A and C in
  `heuristic-write-congestion.md`. Not surfaced in Slow Query
  Patterns.
- `PostgresServer_TransactionsRolledBack_Total` vs
  `_Committed_Total` — rollback rate; also not directly in
  Slow Query Patterns.
- `PostgresServer_DiskWrites_Total` — global write pressure
  (useful for sub-pattern B / WAL congestion in
  `heuristic-write-congestion.md`).

When doing the second scrape, the upstream collector refreshes
exposed values **roughly once per minute** (verified
empirically, May 2026 — not stated in the docs). A gap shorter
than ~60s returns identical counter values. **Use ≥90s, 120s
is the safe default.** If your delta on every counter is zero
despite live traffic, suspect that you scraped within one
refresh window.

```bash
curl -s -u "$CH_CLOUD_KEY:$CH_CLOUD_SECRET" \
  "https://api.clickhouse.cloud/<resolved path>" > /tmp/pg-prom-1.txt
sleep 120
curl -s -u "$CH_CLOUD_KEY:$CH_CLOUD_SECRET" \
  "https://api.clickhouse.cloud/<resolved path>" > /tmp/pg-prom-2.txt
```

Document timestamps and the gap. Compare identical label sets and account for counter resets; a negative delta is not negative activity. While waiting, analyze independent evidence and keep the user informed.

## What this surface does NOT show

No per-query metrics. No scan-type counters. No
autovacuum/analyze timestamps. No load averages. The
per-query story lives in Slow Query Patterns.

## Field name caveat

Metric names listed above match the user-facing docs at
https://clickhouse.com/docs/cloud/managed-postgres/monitoring/metrics.
Confirm exact casing in the actual scrape output on first
use; the API is Beta and names may shift.

---

# Slow Query Patterns API

## Endpoint (resolve from OpenAPI)

Operation: `slowQueryPatternsGetList` (tag: Postgres). **Beta.**

Before constructing a request, follow `openapi-discovery.md` to
resolve the current path, required query params, and response
schema. The reference snapshot below documents what May 2026
looked like; the live spec is authoritative.

Reference path (May 2026 snapshot):

```
GET https://api.clickhouse.cloud/v1/organizations/{organizationId}/postgres/{postgresId}/slowQueryPatterns
```

Auth: HTTP Basic with a ClickHouse Cloud API key (username) and
secret (password).

## Required query params

The slow-query endpoint requires a time window:

- `from_date` — ISO 8601 UTC date-time.
- `to_date` — ISO 8601 UTC date-time.

Use the reported incident window; absent one, a clearly stated last-15-minute window is a starting point.

## Useful optional query params

- `sort_by` — sort key. Reference values from the May 2026
  snapshot: `total_duration` (default), `avg_duration`,
  `call_count`, `total_blks_read`, `total_cpu_time`,
  `error_count`, `max_duration`, `p50_duration`,
  `p95_duration`, `p99_duration`, `total_rows`,
  `total_shared_blks_hit`, `total_wal_bytes`. Confirm enum
  values from the live spec.
- `sort_order` — default `desc`.
- `limit` — default 20, max 500.
- `db_name`, `db_user`, `db_operation`, `app` — filters.

## Request template

The API requires **millisecond precision** on the date-time
strings (`.000Z`). RFC 3339 strings without milliseconds
(e.g., `2026-05-29T10:00:00Z`) are rejected with HTTP 400 even
though the spec just says `format: date-time`. Use the format
below:

```bash
from_date=$(date -u -v-15M +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null \
            || date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%S.000Z)
to_date=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

# Use curl -G with --data-urlencode so the params are encoded
# correctly. Substitute the path resolved from
# openapi-discovery.md.
curl -s -G -u "$CH_CLOUD_KEY:$CH_CLOUD_SECRET" \
  "https://api.clickhouse.cloud/<resolved path>" \
  --data-urlencode "from_date=$from_date" \
  --data-urlencode "to_date=$to_date" \
  --data-urlencode "sort_by=total_duration" \
  --data-urlencode "limit=10"
```

If a request returns `HTTP 400` with body
`BAD_REQUEST: '<your date>'`, the parser rejected that
specific value — verify millisecond precision and the `Z`
suffix.

## Response envelope

Standard ClickHouse Cloud envelope:

```json
{
  "status": 200,
  "requestId": "<uuid>",
  "result": [ { /* pattern */ }, ... ]
}
```

## Field roles (from `openapi-discovery.md`)

Use the role map you built during discovery. The roles you need
for the heuristics:

- `query_id` — pattern identifier.
- `query_text` — normalized SQL.
- `db_operation` — SELECT / INSERT / UPDATE / DELETE / UTILITY.
- `call_count` — executions in the window.
- `total_duration` — aggregate runtime.
- `avg_duration` — mean per-call latency.
- `p50`, `p95`, `p99` — percentile latencies.
- `total_rows` — rows returned/affected across all calls.
- `blocks_read_from_disk` — pages read from disk (cache misses).
- `blocks_served_from_cache` — pages served from cache.
- `total_wal_bytes` — WAL bytes generated.
- `error_count` — failed executions.

When citing values in your reasoning, name the resolved
field (e.g., `totalSharedBlksRead` in the May 2026 snapshot),
not the role.

## Derived values

The API does not return a cache hit ratio. Compute:

```
cache_hit_ratio = <blocks_served_from_cache>
                / max(<blocks_served_from_cache> + <blocks_read_from_disk>, 1)
```

Blocks-touched-per-returned-row ratio for the read-path heuristic:

```
blks_touched_per_row = (<blocks_served_from_cache> + <blocks_read_from_disk>)
                     / max(<total_rows>, 1)
```

When the denominator is zero, report the ratio as undefined and inspect counts separately; the max(..., 1) formula is only a display convenience.

Use **total blocks touched** (hit + read), not just disk reads.
A hot table fully resident in cache still produces a high
`blks_touched_per_row` if every call scans it.

## Expect ClickHouse Cloud internal probes in the top-N

The control plane runs its own monitoring queries against
managed Postgres instances — `SELECT pg_current_wal_lsn()`,
`SELECT pg_is_in_recovery()`, `SHOW log_directory`, and a
handful of similar admin probes. They appear in the Slow Query
Patterns response with high `callCount` (one per probe
interval) but `totalDurationUs ≈ 0` and zero IO. They don't
affect the diagnosis but waste top-N slots.

Request enough patterns to retain the user workload. Identify likely internal probes from normalized query text, application/user labels where available, and negligible resource use together. Do not discard every pattern below a fixed duration threshold: a low-volume failure or rare high-latency call may be the incident.

Prioritize by the symptom (aggregate cost, tail latency, or errors) and show the relevant patterns. Use resolved field names from the role map rather than a hardcoded historical name.

The `app` filter param accepts equality only (no
`app != bin/monitor`), so server-side filtering doesn't work
for "exclude internal probes." Post-filter is the path.

## What this surface does NOT show

- No EXPLAIN plans.
- No scan-type counters.
- No table or column statistics.
- The list is filtered server-side to "slow" patterns — there
  may be other patterns the API doesn't surface.

Reason from the IO and timing signal, not the plan tree.

---

# Triage

A decision tree for picking the right heuristic. Run this
after scraping Prometheus and pulling slow query patterns, but
before applying any specific heuristic.

Field names below reference **roles** from your session's role
map (per `openapi-discovery.md`).

## Step 1 — Read system context from the single Prom scrape

From the gauges in `prometheus-scrape.md`:

- **`CacheHitRatio` well below ~95%** on a workload that
  should fit in cache → possible cache pressure; compare with workload and incident timing.
- **`ActiveConnections` near the pool ceiling** → client
  fan-out or stuck queries.
- **All gauges healthy** → no issue visible in this snapshot; transient or unexposed system problems remain possible. Continue with pattern evidence.

(Confirm Prom metric names against the live scrape; user-facing
docs are at
https://clickhouse.com/docs/cloud/managed-postgres/monitoring/metrics.)

Note: the per-pattern *rate-of-change* data you'd otherwise
derive from two Prom scrapes lives in Slow Query Patterns —
that's Step 2. You only need a second Prom scrape when this
step or Step 2 hints at write-congestion (see
`heuristic-write-congestion.md`).

## Step 2 — What does the slow query pattern shape look like?

Read the patterns relevant to aggregate duration, tail latency, or errors **after
identifying likely CH Cloud internal probes** (see
`slow-query-patterns-fields.md` → "Expect ClickHouse Cloud
internal probes"). For each, look
at the relationship between `<call_count>`, `<avg_duration>`,
`<total_rows>`, and `<blocks_read_from_disk>` +
`<blocks_served_from_cache>`:

| Pattern shape | Likely cause | Apply heuristic |
|---|---|---|
| One pattern dominates; high `blks_touched_per_row`; low derived cache hit ratio | Full scan (missing or unused index) | `heuristic-full-scan.md` |
| One pattern dominates; huge `<call_count>`, tiny `<avg_duration>`, large `<total_duration>` | N+1 / hot loop in the app | `heuristic-hot-loop.md` |
| High `<avg_duration>`, low `<blocks_read_from_disk>` and `<blocks_served_from_cache>` per call | Likely waits/locks (this skill can't fully confirm) | Surface and ask user to check `pg_stat_activity` |
| Many patterns simultaneously slow; low derived cache hit ratio across them | Capacity / cache thrash | Surface as a capacity concern, not a per-query fix |
| Top patterns have `<db_operation>` of INSERT/UPDATE/DELETE with high `<total_wal_bytes>` | Write-path congestion | `heuristic-write-congestion.md` |

## Step 3 — If signal is ambiguous, do not invent

If no single pattern matches a row above, report the top three
with their key ratios and ask the user which one corresponds
to a workload they recognize. Do not pick a heuristic at
random.

## What this skill does NOT cover yet

- Replication lag.
- Schema bloat / autovacuum starvation.
- TLS/connection-pool misconfiguration.
- Specific query rewrites (the heuristics recommend
  indexes/batching, not query refactors).

If the signal points at one of the above, say so and surface
it rather than forcing a fit. New heuristics for these
patterns are welcome as PRs.

---

# Heuristic: full scan

**Use when** the triage decision tree pointed here: read-heavy
Prom signal + one slow query pattern dominates with high
`blks_touched_per_row` and a low derived cache hit ratio.

Field names below reference **roles**, not literal API
properties. Substitute the resolved actual names from your
session's role map (built per `openapi-discovery.md`).

## The ratio

For the candidate pattern:

    blks_touched_per_row =
      (<blocks_served_from_cache> + <blocks_read_from_disk>)
      / max(<total_rows>, 1)

A high ratio suggests substantial work per returned row. It does not establish a sequential scan: aggregates, joins, and legitimate broad queries can also return few rows after touching many blocks. Confirm with a plan and workload context.

**Use blocks _touched_ (hit + read), not just disk reads.** A
hot table fully cached still produces a high
`blks_touched_per_row` if every call scans it. Disk-only
thinking misses cache-resident full scans.

When you report numbers, cite the resolved field names from
your role map so the user can verify against their own API
response.

## What it cannot distinguish

Possible explanations that need plan evidence include:

1. **Missing index** on the predicate / sort column(s).
2. **Existing index ignored** by the planner — stale stats, a
   type mismatch in the comparison, a function applied to the
   indexed column, or a non-sargable predicate.

You cannot tell them apart without seeing a plan. Flag both
possibilities in the recommendation.

## Recommending an index

If the user confirms there is no covering index, recommend:

```sql
CREATE INDEX CONCURRENTLY <descriptive_name>
  ON <table> (<predicate_cols>[, <order_cols> [ASC|DESC]])
  [WHERE <selectivity_predicate>];
```

Rules of thumb:

- **Consider `CONCURRENTLY` for a live write-serving table.** It avoids blocking normal writes but still has locks, waits, and operational constraints; it cannot run inside a transaction block.
- **Include the ORDER BY column.** If the query's `ORDER BY`
  matches, put it in the index in the right direction so the
  index can serve the sort.
- **Partial index when the predicate is highly selective.**

## Recommending an investigation (if an index already exists)

If the user reports a covering index already exists:

1. Inspect plain EXPLAIN first. EXPLAIN (ANALYZE, BUFFERS) executes the query and needs an appropriate environment and execution budget; take particular care with writes.
2. If it isn't, check for: function on indexed column, type
   mismatch in the predicate, stale stats (`ANALYZE` the
   table), or a bad cost estimate.

---

# Heuristic: hot loop (N+1)

**Use when** the triage decision tree pointed here: one pattern
has a very high `<call_count>` and a very low `<avg_duration>`,
but its `<total_duration>` is one of the largest on the
instance.

Field names reference **roles** from your session's role map
(per `openapi-discovery.md`). Substitute resolved actual names
when citing values.

## The shape

A pattern executing thousands of times per minute with a
sub-millisecond mean may indicate repeated application calls; compare with expected request volume and concurrency. Candidate patterns include:

- Rendering a list and issuing one query per row.
- A poorly batched job: per-record `SELECT` or `INSERT` where
  a single statement could handle many.
- A retry loop hammering a fast-but-pointless query.

High call volume alone does not establish an N+1 problem or rule out database pressure. Confirm a repeated per-request call pattern before recommending batching.

## Confirmation signals

Strong evidence:

- `<avg_duration>` < ~1 ms but `<call_count>` is in the tens
  of thousands over a short window.
- `<blocks_read_from_disk>` per call is small — the query is
  cheap; the issue is volume.
- The derived cache hit ratio is high on this pattern (it's
  hitting cache; it's just hitting it a lot).
- The `<query_text>` looks like a single-row lookup or small
  write: `SELECT ... WHERE id = $1`, `INSERT ... VALUES (...)`.

Weak/contraindicating evidence:

- High `<avg_duration>` — that's not a hot loop, that's a slow
  query at scale.
- Multiple patterns simultaneously elevated — broader load
  issue, not a single hot loop.

## Recommending a fix

The fix lives in the application, not the database. Be
specific about what to look for, using available app code or traces, or a specific follow-up if they are unavailable:

1. **Identify the caller.** Suggest the user grep app logs or
   tracing for the normalized `<query_text>`. The framework's
   ORM-generated queries usually have a distinctive shape.
2. **Batch the loop.** For reads: `SELECT ... WHERE id =
   ANY($1)` with the array of IDs. For writes: `INSERT ...
   VALUES (...), (...), (...)` or `COPY`.
3. **Cache where applicable.** If the same single-row lookup
   happens in a render loop, the app likely should be reading
   once and reusing.

## What NOT to recommend

- Indexes — `<avg_duration>` is small; there's probably already
  one. Adding more won't help.
- DB-side `statement_timeout` — papers over the loop.
- Connection pool tweaks — the loop is the cause, not the
  pool.

---

# Heuristic: write-path congestion

**Use when** the triage decision tree pointed here: top
patterns have `<db_operation>` of INSERT/UPDATE/DELETE with
large `<total_wal_bytes>`, or the user reports symptoms
(timeouts, retries) that this skill's per-pattern view alone
can't confirm.

This is the one heuristic that may need the **opt-in second
Prom scrape** (see `prometheus-scrape.md`) — specifically to
get a non-zero delta on `PostgresServer_Deadlocks_Total` and a
rollback/commit ratio from
`PostgresServer_TransactionsRolledBack_Total` vs
`_Committed_Total`. Neither is exposed in Slow Query Patterns.

Field names reference **roles** from your session's role map
(per `openapi-discovery.md`).

## The shape

Three sub-patterns live under "write congestion." Distinguish
before recommending.

### Sub-pattern A: deadlocks

`PostgresServer_Deadlocks_Total` delta > 0 over the window.
At least two concurrent transactions are taking locks in
incompatible orders.

**Recommend:**

- Surface the deadlock count and ask the user to check
  Postgres logs for `deadlock detected` entries — these log
  the exact statements involved, which the API doesn't.
- Common cause: two transactions update the same set of rows
  in different orders. Fix is application-side: lock rows in
  a consistent order (e.g., always sort by primary key
  before issuing updates).

### Sub-pattern B: slow individual writes

One write pattern with high `<avg_duration>`. Could be a wide
row insert under contention, a large update touching many
rows, or WAL congestion under heavy concurrent writes.

**Recommend:**

- For wide rows: check column count and TOAST-eligible
  fields. Consider whether some columns belong in a side
  table.
- For wide updates (high `<total_rows>` per call): batch into
  smaller chunks with explicit transactions, so each chunk
  commits separately.
- For concurrent-write pressure: surface `<total_wal_bytes>`.
  If high, the bottleneck is WAL flush — the user may need to
  tune `commit_delay` / `synchronous_commit` (with durability
  tradeoffs the user must own) or scale the instance.

### Sub-pattern C: high error rate

`<error_count>` is unusually large relative to `<call_count>`,
or `PostgresServer_TransactionsRolledBack_Total` delta is high
relative to commits.

**Recommend:**

- Application is throwing exceptions mid-transaction or
  hitting serialization conflicts on `SERIALIZABLE` /
  `REPEATABLE READ` isolation.
- Surface the error / rollback rate; ask the user to check
  app error logs for the actual exception traces — the API
  doesn't expose those.

## What NOT to recommend

- An index — write congestion is rarely indexed away. More
  indexes make writes slower.
- Vacuum tuning unless there's specific evidence of bloat —
  this surface doesn't expose bloat metrics, so don't guess.
- Hardware sizing — out of scope for a single-pattern RCA.
  Surface the WAL/commit pressure and recommend the user
  discuss with their account team.

---

# Output template

Use this structure when a full RCA report is helpful. Adapt it to the user’s request; a focused follow-up need not repeat every section.

````markdown
## Symptom

<one or two sentences on what the Prometheus signal showed,
naming the specific metrics and the rate-of-change or value
that flagged the issue>

## Evidence

The dominant slow query pattern(s) from
`slowQueryPatternsGetList`:

```json
<the actual JSON object(s), trimmed to the fields that matter
for the heuristic you applied — typically call_count,
total_duration, avg_duration, total_rows, blocks_read_from_disk,
blocks_served_from_cache, query_text. Use the resolved actual
field names from your session's role map, not the role labels.>
```

Key derived values (if applicable to the heuristic):
- `blks_touched_per_row` = <number>
- `call_count` over the window = <number>
- derived cache hit ratio = <number>

## Hypothesis

<the heuristic you matched (e.g., full scan, hot loop, write
congestion) and the most likely underlying cause. If the
heuristic cannot distinguish between two causes from this
surface alone, state both and explain what would
distinguish them.>

## Recommended action

<the concrete fix. For an index recommendation:>

```sql
CREATE INDEX CONCURRENTLY <descriptive_name>
  ON <table> (<cols>) [WHERE <predicate>];
```

<For an application-side fix: a specific code/query change to
make, e.g. "batch the loop into a single SELECT with
`WHERE id = ANY($1)`".>

<For a configuration/operational concern: the specific check
or follow-up the user should run, e.g. "check Postgres logs
for `deadlock detected` entries to see the conflicting
statements".>

One sentence on why this action addresses the diagnosed cause.

## Long-term follow-ups

- <bullet — e.g., audit other unindexed filterable columns on
  the same table>
- <bullet — e.g., add a CI check that flags new ORM-generated
  per-row queries>

````

## Style rules

- Quote real values from the API response, not hand-waved
  numbers.
- For DDL recommendations, default to `CREATE INDEX
  CONCURRENTLY` when minimizing write blocking is required; describe its operational constraints rather than claiming it takes no locks.
- For application-side recommendations, be specific about
  what to inspect in the codebase; use available code evidence rather than assuming it is inaccessible.
- If you cannot fully diagnose from the data available, say
  so. Surface what you saw and ask for the missing piece
  rather than overreaching.

---

# Diagnostic boundary

A performance investigation authorizes evidence collection and recommendations, not changes to the database. Within this RCA workflow, do not execute DDL/DML, maintenance commands, cancel queries, or change configuration, roles, or extensions.

Write a proposed fix only when the evidence supports it. Identify assumptions that need confirmation, and distinguish SQL suggested from commands actually run. Do not imply that a candidate index is ready for production solely because an IO ratio is high.

If the user separately requests implementation, treat that as a new scope: use appropriate implementation tools, verify the target and relevant schema/plan, and apply the user's authorization and operational safeguards. Do not refuse solely because this diagnostic skill is recommend-only, and do not infer approval from the original diagnosis request.

Read-only API calls can confirm a fix after it is applied. Reuse the same incident/comparison windows and report what changed rather than repeating diagnostics without a purpose.
