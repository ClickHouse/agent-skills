# Unknown INSERT outcomes and safe recovery

Use this path when a write fails, duplicates appear, or the caller must decide
whether to retry. A transport reset describes the connection; it does not prove
whether the server received nothing, committed the batch, or wrote only part
of a larger operation. Treat retry code as a possible duplicate mechanism
unless the incident evidence establishes causation.

## Keep the original outcome visible

Avoid automatically replaying an attempt after possible dispatch. Preserve the
caller-visible error and useful original cause, and retain the supplied
`query_id` for correlation. A query ID is not an idempotency key. Whether a
retry is deduplicated depends on the actual engine, settings, block/token
identity and deduplication window; do not assume that repeating a query ID
provides this protection.

A retry can be justified by affirmative evidence that the request was never
dispatched, or by an established idempotent replay contract. Assess the actual
transport phase; a bare error-code allowlist or a code found somewhere in a
nested cause chain does not certify that phase. Do not turn every server error
into “nothing was applied”: a synchronous single-block insert into one
partition of one MergeTree-family table has a documented all-or-nothing
guarantee. Check acknowledgement settings for async inserts;
`wait_for_async_insert=0` does not provide that guarantee. Multi-block,
multi-partition, distributed and dependent materialized-view writes require
their own scope analysis.

## Reconcile before allowing manual replay

Correlate the attempt with its time, destination and stable batch/business
identifiers. Reused query IDs can refer to several attempts. Inspect available
query state, terminal logs and destination data as complementary evidence:

- No `query_log` row, even after flushing, does not prove nonexecution. Logs
  can be disabled, sampled, delayed or recorded on another node.
- `QueryStart` without a terminal event does not prove noncommit; the original
  operation may still be running after the client disconnects.
- Matching rows may predate this attempt or come from another writer. Missing
  rows observed while an original or competing write is active can arrive later.

Before replaying rows believed missing, establish that the original operation
has settled across the relevant destinations and that competing writers or
recovery attempts cannot invalidate the comparison. Use the workflow's existing
coordination or verified deduplication boundary; do not invent a new service or
change schema merely to complete a narrow client fix. Compare the intended
payload with attributable destination state, then replay only what that
procedure establishes was not applied. If the evidence or concurrency boundary
cannot be established, leave the outcome unresolved for an operator instead
of presenting a resend as safe. An already established idempotent replay
contract may provide a different, explicitly justified recovery path.

Transport fixes can prevent recurrence when supported by evidence; they do
not retroactively settle an earlier write. State the narrow guarantee of the
code change and the remaining uncertainty without requiring an exhaustive
incident report for every client error.

Sources: [HTTP request lifetime](https://clickhouse.com/docs/concepts/features/interfaces/http),
[query log behavior](https://clickhouse.com/docs/reference/system-tables/query_log),
[insert atomicity boundaries](https://clickhouse.com/docs/concepts/features/operations/insert/transactions),
and [Node system errors](https://nodejs.org/api/errors.html#common-system-errors).
