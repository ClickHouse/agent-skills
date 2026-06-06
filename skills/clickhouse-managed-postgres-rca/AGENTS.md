# ClickHouse Managed Postgres RCA

**Version 0.1.0**
ClickHouse Inc
May 2026
ClickHouse-managed Postgres (Beta APIs)

## Abstract

This skill walks an AI agent through an evidence-based root-cause
analysis loop for a ClickHouse-managed Postgres instance. It
surfaces two Beta ClickHouse Cloud APIs — the Prometheus metrics
endpoint (`postgresInstancePrometheusGet`) for system signal, and
the Slow Query Patterns API (`slowQueryPatternsGetList`) for
per-pattern evidence — and guides the agent to scrape system
gauges, pull the dominant slow query patterns, triage the signal
against a small heuristic library (full scan, hot loop, write
congestion at v0.1), and produce a structured, recommend-only
report. The skill never executes DDL and never kills queries.

This file is the full compiled guide: the workflow followed by
every rule expanded inline, for agents that want all of it in a
single context load. The canonical sources are `SKILL.md` (entry
point) and the individual files under `rules/`.

## Core principles

- **Resolve the live API shape first.** Both endpoints are Beta;
  paths and field names shift. Discover them from the OpenAPI
  spec and build a semantic role map. Never hardcode field names.
- **Reason from IO and timing, not from a plan tree.** There are
  no EXPLAIN plans, scan-type counters, or vacuum timestamps on
  this surface.
- **Triage before diagnosing.** Match the combined signal to a
  heuristic; if nothing fits cleanly, surface what you saw and
  ask rather than inventing a hypothesis.
- **Recommend only.** Write the fix, explain it, and let a human
  apply it.

## Workflow

Six steps, in order. Steps 2 and 3 share only auth (no data
dependency) and can run in parallel.

1. **Discover the live API shape** — fetch the OpenAPI spec,
   locate both operations by `operationId`, resolve paths and
   the slow-query response schema, and build a session role map.
   See *OpenAPI discovery*.
2. **Scrape Prometheus once for system gauges** — `CacheHitRatio`,
   `ActiveConnections`, `MemoryUsedPercent`,
   `FilesystemUsedPercent`. A second scrape for counter deltas is
   opt-in (write-congestion only). See *Prometheus scrape*.
3. **Pull top slow query patterns** — the primary diagnostic;
   per-pattern accumulated totals over the window. See *Slow
   Query Patterns API*.
4. **Triage** — match the combined Prom + slow-query signal to a
   heuristic shape. See *Triage*.
5. **Reason, then recommend** — symptom, evidence, hypothesis,
   short-term fix, long-term follow-ups. See *Output template*.
6. **Do not apply the fix** — never run DDL, never kill queries.
   See *Recommend-only boundary*.

## Rule index

1. OpenAPI discovery — `rules/openapi-discovery.md`
2. Prometheus scrape — `rules/prometheus-scrape.md`
3. Slow Query Patterns API — `rules/slow-query-patterns-fields.md`
4. Triage — `rules/triage.md`
5. Heuristic: full scan — `rules/heuristic-full-scan.md`
6. Heuristic: hot loop (N+1) — `rules/heuristic-hot-loop.md`
7. Heuristic: write-path congestion — `rules/heuristic-write-congestion.md`
8. Output template — `rules/output-template.md`
9. Recommend-only boundary — `rules/recommend-only.md`

---

## OpenAPI discovery

Both endpoints this skill uses are **Beta**. Field names and
paths may shift. Before constructing any requests, resolve the
current shape from the live OpenAPI spec.

### How (with 24h cache)

The spec changes rarely. Cache the resolved paths + role map to
`/tmp/ch-cloud-rca-cache.json` after a successful discovery,
and reuse it for up to 24 hours before re-fetching.

Boilerplate (run at session start):

```bash
CACHE=/tmp/ch-cloud-rca-cache.json
TTL=86400  # 24 hours

if [ -f "$CACHE" ]; then
  if command -v stat >/dev/null 2>&1; then
    # macOS BSD stat; GNU stat fallback for Linux
    mtime=$(stat -f %m "$CACHE" 2>/dev/null || stat -c %Y "$CACHE")
  fi
  age=$(( $(date +%s) - mtime ))
else
  age=$((TTL + 1))
fi

if [ "$age" -lt "$TTL" ]; then
  echo "openapi-discovery: using cache ($((age/3600))h old)"
else
  echo "openapi-discovery: re-fetching spec"
  curl -s https://api.clickhouse.cloud/v1 > /tmp/ch-cloud-openapi.json
  # ...then parse + write $CACHE; see "Cache format" below.
fi
```

The cache lets the skill skip the ~863 KB fetch + parse on
every session. Twenty-four hours is generous; the underlying
schema shifts on a weeks-to-months cadence, not daily.

### Cache format

After a fresh fetch, write the resolved knowledge to
`/tmp/ch-cloud-rca-cache.json`:

```json
{
  "paths": {
    "postgresInstancePrometheusGet": "/v1/organizations/{organizationId}/postgres/{postgresId}/prometheus",
    "slowQueryPatternsGetList": "/v1/organizations/{organizationId}/postgres/{postgresId}/slowQueryPatterns"
  },
  "role_map": {
    "call_count": "callCount",
    "total_duration": "totalDurationUs",
    "total_rows": "totalRows",
    "blocks_read_from_disk": "totalSharedBlksRead",
    "blocks_served_from_cache": "totalSharedBlksHit",
    ...
  }
}
```

`cat /tmp/ch-cloud-rca-cache.json` is also a useful debugging
hook between sessions: it shows exactly what the agent thinks
the API looks like.

### Invalidating the cache

Two reasons to invalidate before the 24h TTL expires:

1. A request returned `HTTP 400` with a message mentioning a
   field name that's in `role_map` — the field was renamed or
   removed. Re-fetch.
2. The user explicitly asks for a refresh. Run
   `rm /tmp/ch-cloud-rca-cache.json` and re-run discovery.

Don't invalidate on every 4xx — date-format or value errors
won't shift the spec.

### Operations to locate

- **`slowQueryPatternsGetList`** (tag: Postgres) — list slow
  query patterns for a Postgres service.
- **`postgresInstancePrometheusGet`** (tag: Prometheus) —
  scrape Prom for a Postgres service.

Find them by `operationId`, not by path. Paths may move
between spec versions; operation IDs are the stable contract.

### What to extract per operation

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

### Build a role map for the slow-query schema

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

### Spotting drift

If you can't find a property whose description matches a role:

- Note it explicitly: "Role `blocks_served_from_cache`: no
  matching field in the current spec."
- Proceed with the diminished signal (e.g., for full-scan
  detection, fall back to disk-reads only — but flag the
  ambiguity in the recommendation).
- Don't guess at field names. Unresolved roles are real gaps.

### Reference: May 2026 spec snapshot

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

Always rebuild from the live spec; don't paste this in as a
substitute for discovery.

---

## Prometheus scrape

### How

Use the path resolved during OpenAPI discovery
(`postgresInstancePrometheusGet`). HTTP Basic with the user's
ClickHouse Cloud API key/secret.

```bash
curl -s -u "$CH_CLOUD_KEY:$CH_CLOUD_SECRET" \
  "https://api.clickhouse.cloud/<resolved path>" > /tmp/pg-prom.txt
```

The response is Prometheus exposition format text (lines like
`PostgresServer_X{...} <value>`).

### Default: one scrape, gauges only

The skill's default Prom step is **a single scrape** that
extracts current values from gauges. No wait, no second scrape.
The Slow Query Patterns API gives the per-pattern rate-of-change
data — see `slow-query-patterns-fields.md` — so the only role
left for Prom is system-level context.

Gauges to read on the single scrape:

- `PostgresServer_CacheHitRatio` — current ratio. Below ~95%
  on a workload that should fit in cache = cache thrash.
- `PostgresServer_ActiveConnections` — current count (often
  split by `state` label: active / idle / idle in transaction).
  Climbing toward a known pool ceiling = client fan-out or
  stuck queries.
- `PostgresServer_MemoryUsedPercent` — current. Helps qualify
  cache hit ratio (low memory usage but bad hit ratio = the
  workload is bigger than RAM).
- `PostgresServer_FilesystemUsedPercent` — current. High =
  storage pressure, separate concern from query latency.

### Opt-in: rate-of-change from two scrapes

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

Document the gap you used so a reader can sanity-check.

### What this surface does NOT show

No per-query metrics. No scan-type counters. No
autovacuum/analyze timestamps. No load averages. The
per-query story lives in Slow Query Patterns.

### Field name caveat

Metric names listed above match the user-facing docs at
https://clickhouse.com/docs/cloud/managed-postgres/monitoring/metrics.
Confirm exact casing in the actual scrape output on first
use; the API is Beta and names may shift.

---

## Slow Query Patterns API

### Endpoint (resolve from OpenAPI)

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

### Required query params

The slow-query endpoint requires a time window:

- `from_date` — ISO 8601 UTC date-time.
- `to_date` — ISO 8601 UTC date-time.

For RCA, default to the last 15 minutes.

### Useful optional query params

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

### Request template

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

### Response envelope

Standard ClickHouse Cloud envelope:

```json
{
  "status": 200,
  "requestId": "<uuid>",
  "result": [ { /* pattern */ }, ... ]
}
```

### Field roles (from `openapi-discovery.md`)

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

### Derived values

The API does not return a cache hit ratio. Compute:

```
cache_hit_ratio = <blocks_served_from_cache>
                / max(<blocks_served_from_cache> + <blocks_read_from_disk>, 1)
```

Per-call IO ratio for the full-scan heuristic:

```
blks_touched_per_row = (<blocks_served_from_cache> + <blocks_read_from_disk>)
                     / max(<total_rows>, 1)
```

Use **total blocks touched** (hit + read), not just disk reads.
A hot table fully resident in cache still produces a high
`blks_touched_per_row` if every call scans it.

### Expect ClickHouse Cloud internal probes in the top-N

The control plane runs its own monitoring queries against
managed Postgres instances — `SELECT pg_current_wal_lsn()`,
`SELECT pg_is_in_recovery()`, `SHOW log_directory`, and a
handful of similar admin probes. They appear in the Slow Query
Patterns response with high `callCount` (one per probe
interval) but `totalDurationUs ≈ 0` and zero IO. They don't
affect the diagnosis but waste top-N slots.

**Two-step filter:**

1. Ask for `limit=10` (or higher) on the request so the
   user-traffic patterns survive even if internal probes fill
   the top slots.
2. Post-filter the response — skip any pattern where
   `totalDurationUs` is below, say, 1,000,000 (1s aggregate
   over the window). Real user-traffic patterns will always
   clear that threshold; internal probes won't.

```python
patterns = [p for p in resp['result'] if p['totalDurationUs'] >= 1_000_000]
```

Then take the top 3 by `totalDurationUs` from what remains.

The `app` filter param accepts equality only (no
`app != bin/monitor`), so server-side filtering doesn't work
for "exclude internal probes." Post-filter is the path.

### What this surface does NOT show

- No EXPLAIN plans.
- No scan-type counters.
- No table or column statistics.
- The list is filtered server-side to "slow" patterns — there
  may be other patterns the API doesn't surface.

Reason from the IO and timing signal, not the plan tree.

---

## Triage

A decision tree for picking the right heuristic. Run this
after scraping Prometheus and pulling slow query patterns, but
before applying any specific heuristic.

Field names below reference **roles** from your session's role
map (per `openapi-discovery.md`).

### Step 1 — Read system context from the single Prom scrape

From the gauges in `prometheus-scrape.md`:

- **`CacheHitRatio` well below ~95%** on a workload that
  should fit in cache → cache thrash, real signal on its own.
- **`ActiveConnections` near the pool ceiling** → client
  fan-out or stuck queries.
- **All gauges healthy** → the system is fine; whatever's slow
  is per-query, not system-wide. Move on to Step 2.

(Confirm Prom metric names against the live scrape; user-facing
docs are at
https://clickhouse.com/docs/cloud/managed-postgres/monitoring/metrics.)

Note: the per-pattern *rate-of-change* data you'd otherwise
derive from two Prom scrapes lives in Slow Query Patterns —
that's Step 2. You only need a second Prom scrape when this
step or Step 2 hints at write-congestion (see
`heuristic-write-congestion.md`).

### Step 2 — What does the slow query pattern shape look like?

Read the top 3 patterns by `<total_duration>` **after
filtering out CH Cloud internal probes** (see
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

### Step 3 — If signal is ambiguous, do not invent

If no single pattern matches a row above, report the top three
with their key ratios and ask the user which one corresponds
to a workload they recognize. Do not pick a heuristic at
random.

### What this skill does NOT cover yet

- Replication lag.
- Schema bloat / autovacuum starvation.
- TLS/connection-pool misconfiguration.
- Specific query rewrites (the heuristics recommend
  indexes/batching, not query refactors).

If the signal points at one of the above, say so and surface
it rather than forcing a fit. New heuristics for these
patterns are welcome as PRs.

---

## Heuristic: full scan

**Use when** the triage decision tree pointed here: read-heavy
Prom signal + one slow query pattern dominates with high
`blks_touched_per_row` and a low derived cache hit ratio.

Field names below reference **roles**, not literal API
properties. Substitute the resolved actual names from your
session's role map (built per `openapi-discovery.md`).

### The ratio

For the candidate pattern:

    blks_touched_per_row =
      (<blocks_served_from_cache> + <blocks_read_from_disk>)
      / max(<total_rows>, 1)

A ratio in the hundreds or thousands per row returned is the
full-scan signature even without a plan.

**Use blocks _touched_ (hit + read), not just disk reads.** A
hot table fully cached still produces a high
`blks_touched_per_row` if every call scans it. Disk-only
thinking misses cache-resident full scans.

When you report numbers, cite the resolved field names from
your role map so the user can verify against their own API
response.

### What it cannot distinguish

Two causes look identical on this surface:

1. **Missing index** on the predicate / sort column(s).
2. **Existing index ignored** by the planner — stale stats, a
   type mismatch in the comparison, a function applied to the
   indexed column, or a non-sargable predicate.

You cannot tell them apart without seeing a plan. Flag both
possibilities in the recommendation.

### Recommending an index

If the user confirms there is no covering index, recommend:

```sql
CREATE INDEX CONCURRENTLY <descriptive_name>
  ON <table> (<predicate_cols>[, <order_cols> [ASC|DESC]])
  [WHERE <selectivity_predicate>];
```

Rules of thumb:

- **`CONCURRENTLY`, always.** Never block writes on a running
  instance. Note in the recommendation that this takes longer
  but doesn't lock.
- **Include the ORDER BY column.** If the query's `ORDER BY`
  matches, put it in the index in the right direction so the
  index can serve the sort.
- **Partial index when the predicate is highly selective.**

### Recommending an investigation (if an index already exists)

If the user reports a covering index already exists:

1. `EXPLAIN (ANALYZE, BUFFERS) <the slow query>` — confirm
   the planner is or isn't using the index.
2. If it isn't, check for: function on indexed column, type
   mismatch in the predicate, stale stats (`ANALYZE` the
   table), or a bad cost estimate.

---

## Heuristic: hot loop (N+1)

**Use when** the triage decision tree pointed here: one pattern
has a very high `<call_count>` and a very low `<avg_duration>`,
but its `<total_duration>` is one of the largest on the
instance.

Field names reference **roles** from your session's role map
(per `openapi-discovery.md`). Substitute resolved actual names
when citing values.

### The shape

A pattern executing thousands of times per minute with a
sub-millisecond mean is the application calling the database
in a tight loop — typically:

- Rendering a list and issuing one query per row.
- A poorly batched job: per-record `SELECT` or `INSERT` where
  a single statement could handle many.
- A retry loop hammering a fast-but-pointless query.

The database is healthy here. The caller is the problem.

### Confirmation signals

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

### Recommending a fix

The fix lives in the application, not the database. Be
specific about what to look for, since you can't see the app
code:

1. **Identify the caller.** Suggest the user grep app logs or
   tracing for the normalized `<query_text>`. The framework's
   ORM-generated queries usually have a distinctive shape.
2. **Batch the loop.** For reads: `SELECT ... WHERE id =
   ANY($1)` with the array of IDs. For writes: `INSERT ...
   VALUES (...), (...), (...)` or `COPY`.
3. **Cache where applicable.** If the same single-row lookup
   happens in a render loop, the app likely should be reading
   once and reusing.

### What NOT to recommend

- Indexes — `<avg_duration>` is small; there's probably already
  one. Adding more won't help.
- DB-side `statement_timeout` — papers over the loop.
- Connection pool tweaks — the loop is the cause, not the
  pool.

---

## Heuristic: write-path congestion

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

### The shape

Three sub-patterns live under "write congestion." Distinguish
before recommending.

#### Sub-pattern A: deadlocks

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

#### Sub-pattern B: slow individual writes

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

#### Sub-pattern C: high error rate

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

### What NOT to recommend

- An index — write congestion is rarely indexed away. More
  indexes make writes slower.
- Vacuum tuning unless there's specific evidence of bloat —
  this surface doesn't expose bloat metrics, so don't guess.
- Hardware sizing — out of scope for a single-pattern RCA.
  Surface the WAL/commit pressure and recommend the user
  discuss with their account team.

---

## Output template

Every RCA response uses this structure. Do not deviate.

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

## What I did NOT do

- I did not run any DDL.
- I did not cancel or kill any queries.
- I did not modify any application code or configuration.
- A human should review the recommendation above and apply it.
````

### Style rules

- Quote real values from the API response, not hand-waved
  numbers.
- For DDL recommendations, default to `CREATE INDEX
  CONCURRENTLY` — never block writes on a running instance.
- For application-side recommendations, be specific about
  what to grep / look for in the codebase, since you cannot
  see it directly.
- If you cannot fully diagnose from the data available, say
  so. Surface what you saw and ask for the missing piece
  rather than overreaching.

---

## Recommend-only boundary

This skill never executes mutations on the Postgres instance.

### Never do

- Run `CREATE INDEX`, `ALTER`, `DROP`, `VACUUM`, `ANALYZE`,
  `REINDEX`, or any other DDL/DML on the user's instance.
- Call `pg_cancel_backend` or `pg_terminate_backend`.
- Modify any configuration, role, or extension.
- Open a `psql` session to the user's instance and run
  commands inside it on their behalf.

### What you do instead

Write the exact SQL the human should run, explain why, and
state explicitly that you did not run it. Use the structure
in `rules/output-template.md`.

### If the user asks you to apply the fix

Decline and explain. Example response:

> I can't apply the fix on your instance — this skill is
> recommend-only by contract. The SQL above is ready to copy;
> you can run it from `psql` or whatever client you use. I'm
> happy to help interpret the result or roll back if it
> doesn't behave as expected.

The point of the boundary is that an agent reasoning from
incomplete information (no plans, no full table stats)
shouldn't be mutating production. The recommendation may be
right but a human should sanity-check the call.

### Read-only operations are fine

The two API calls this skill makes — Prometheus scrape and
slow-query-patterns list — are read-only. You can re-scrape
or re-list freely to confirm a fix took effect after the
human applies it.
