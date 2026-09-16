# Ingestion and UI verification

The example generator passes its token through a CLI flag, so it can appear in process/container metadata as well as its log. Use a dedicated test token on a controlled local host; do not reuse a shared production receiver token in this recipe. Prefer existing traffic where that exposure is unacceptable.

## Verify ingestion

Prefer existing traffic when it can verify the requested signal. Send synthetic telemetry only when requested or agreed for the target; a full multi-signal demo is optional. Label it as synthetic and bound the volume.

For a demo, use `telemetrygen` (the OpenTelemetry Collector Contrib generator) from its **Docker image**, so
nothing is installed on the host. Instead of one flat burst, send telemetry across several
**services**, **severities**, **span statuses**, and **metric types**, so ClickStack's Search,
Service Map, and dashboards have realistic, varied data rather than a single uniform stream.

Load the env file so the token is available, then reference `$OTLP_AUTH_TOKEN`. The `tg` helper
below **redirects all generator output to a log file** and prints only an exit code, because
`telemetrygen` echoes its full config, **including the `authorization` header (your OTLP token)**,
to stdout. Never surface that raw output in the chat. `telemetrygen`'s header syntax requires the
value to be a quoted string: `key="value"`.

```bash
WORKDIR="${WORKDIR:-$HOME/clickstack-otel-collector}"; ENV_FILE="$WORKDIR/collector.env"
[ -f "$WORKDIR/creds.env" ] && . "$WORKDIR/creds.env"; set -a; . "$ENV_FILE"; set +a

TG_IMAGE=ghcr.io/open-telemetry/opentelemetry-collector-contrib/telemetrygen:latest
NET=clickstack-net
ENDPOINT=clickstack-otel-collector:4317
TG_LOG="$WORKDIR/telemetrygen.log"; ( umask 177; : > "$TG_LOG" ); chmod 600 "$TG_LOG"

tg() {
  # usage: tg <logs|traces|metrics> [extra telemetrygen flags...]
  # Output (which contains the token in the echoed config) goes to $TG_LOG, never the terminal.
  local signal="$1"; shift
  docker run --rm --network "$NET" "$TG_IMAGE" "$signal" \
    --otlp-endpoint "$ENDPOINT" \
    --otlp-insecure \
    --otlp-header "authorization=\"$OTLP_AUTH_TOKEN\"" \
    --rate 10 --duration 15s "$@" >>"$TG_LOG" 2>&1
  echo "$signal exit=$?"
}
```

> **Existing-collector path:** set `NET` and `ENDPOINT` to reach *your* collector instead. If it
> runs on this host, use `--network host` style access or point `ENDPOINT` at its published
> address, and set the `authorization` header (or other auth) to whatever your receiver expects.
> Everything below is otherwise identical.

**Judge success using the exit code and evidence of this run's ingestion. Do not print raw generator logs.** Two reasons. First,
the log contains your OTLP token (see above), so do not print it. Second, it is noisy and every run
ends with `rpc error: code = Canceled desc = grpc: the client connection is closing` once
`--duration` elapses, which is **expected shutdown, not a failure**. The `tg` helper already prints
`<signal> exit=0` on success. If you must inspect a failure, grep the log for the real signal
without dumping it, for example `grep -c Unauthenticated "$TG_LOG"` (a non-zero count plus a
non-zero exit means the `authorization` header did not match). Confirm overall success with the row
counts in the verification queries below.

**Quote attribute values so the inner double quotes survive the shell.** `telemetrygen` requires
each attribute as `key="value"` (with literal double quotes), and rejects a bare `key=value` with
`value should be a string wrapped in double quotes`. If you write `--otlp-attributes
deployment.environment="skill-evaluation"`, bash strips the quotes and the container receives
`deployment.environment=skill-evaluation`, which hard-fails. Wrap the **whole argument in single quotes**
so the inner double quotes reach the container, exactly as the `tg` helper already does for the
auth header.

Logs across two services with different severities and bodies, including an error line:

```bash
tg logs --service skill-demo-checkout --severity-text Info  --severity-number 9 \
  --body "checkout completed" \
  --otlp-attributes 'deployment.environment="skill-evaluation"' \
  --telemetry-attributes 'http.method="POST"'
tg logs --service skill-demo-payment  --severity-text Error --severity-number 17 \
  --body "payment gateway timeout" \
  --otlp-attributes 'deployment.environment="skill-evaluation"' \
  --telemetry-attributes 'http.status_code="500"'
```

Traces with child spans, a healthy service and an erroring one (this is what populates the Service
Map and the error views):

```bash
tg traces --service skill-demo-checkout --child-spans 4 --span-duration 120ms --status-code Ok \
  --otlp-attributes 'deployment.environment="skill-evaluation"' \
  --telemetry-attributes 'http.route="/cart"'
tg traces --service skill-demo-payment  --child-spans 3 --span-duration 400ms --status-code Error \
  --otlp-attributes 'deployment.environment="skill-evaluation"' \
  --telemetry-attributes 'http.route="/charge"'
```

Metrics across the three common types, so dashboards have gauges, counters, and a distribution:

```bash
tg metrics --service skill-demo-checkout --metric-type Sum
tg metrics --service skill-demo-checkout --metric-type Gauge
tg metrics --service skill-demo-payment  --metric-type Histogram
```

(`--metric-type` accepts `Gauge`, `Sum`, `Histogram`, or `ExponentialHistogram`. Add `--otlp-http`
with `--otlp-endpoint clickstack-otel-collector:4318` to exercise the HTTP path instead of gRPC.)

Wait ~15 seconds for the collector to flush its batch, then confirm the tables exist:

```bash
clickhousectl cloud service query --id "$SERVICE_ID" --query \
  "SELECT name FROM system.tables WHERE database='otel' ORDER BY name"
```

Then confirm rows are landing. Count by `parts.rows`, which is signal-agnostic and avoids
hard-coding per-signal column names:

```bash
clickhousectl cloud service query --id "$SERVICE_ID" --query \
  "SELECT table, sum(rows) AS rows
   FROM system.parts
   WHERE database='otel' AND active
     AND table IN ('otel_logs','otel_traces',
                   'otel_metrics_sum','otel_metrics_gauge',
                   'otel_metrics_histogram','otel_metrics_exponential_histogram',
                   'otel_metrics_summary')
   GROUP BY table ORDER BY table"
```

Total row counts show tables contain data, not that this run arrived. Record a baseline and inspect the actual schema to query a bounded recent time window for the demo service names (or an existing traffic identifier). Avoid attributing unrelated historical data to this run.

For the full demo, expect non-zero `rows` for `otel_logs`, `otel_traces`, `otel_metrics_sum`,
`otel_metrics_gauge`, and `otel_metrics_histogram`. If a signal is missing:

1. Tail the collector logs (`docker logs --tail 50 clickstack-otel-collector`) for export errors.
2. Confirm the `authorization` header matches `$OTLP_AUTH_TOKEN`: `grep -c Unauthenticated
   "$TG_LOG"` (a non-zero count means a mismatch, the full message is `code = Unauthenticated desc =
   provided authorization does not match expected scheme or token`). Grep rather than print the
   log, since it contains the token.
3. Re-check `CLICKHOUSE_ENDPOINT` has the `https://` scheme and `:8443` port.
4. Some metric kinds flush slowly. Re-run the count after another 30 seconds before declaring
   failure.

Report which requested signals are verified, failed, or still unverified after bounded retries. Do not block a logs-only task on absent metrics.

---

## Step 8: Confirm the service is awake, then complete onboarding in ClickStack

Rows in ClickHouse are **not** the same as the user seeing telemetry in ClickStack. The ClickStack
UI requires a one-time onboarding step that auto-detects the data sources, and that step fails if
the ClickHouse service has idle-suspended in the meantime.

If the target is not already known to be reachable from recent checks, test it:

```bash
clickhousectl cloud service query --id "$SERVICE_ID" --query "SELECT 1"
```

If this returns `1`, the service is awake; continue immediately to the console steps below while it
stays warm. For an error or timeout, inspect the response and service state; sleep is one possible cause. Use bounded retries for transient failures and report persistent auth, network or service errors.

For a new service, provide the onboarding link and needed steps; skip onboarding when sources are already configured. Console labels can change, so use the current UI:

1. Go to the [ClickHouse Cloud console](https://console.clickhouse.cloud) and open the target
   service.
2. In the **left-hand menu, select ClickStack**.
3. Click through to **Getting Started** and follow the onboarding flow.
4. **Ignore any prompt that asks you to set up or configure a collector / start ingestion.** You
   have already done that in the steps above. Skip straight past those screens (click through /
   "Next") to source detection. Re-running the console's collector setup is unnecessary and only
   causes confusion.
5. The data sources are **auto-detected**: logs, traces, and metrics for the `otel` database are
   picked up automatically, and your data appears in the Search and dashboard views.

The direct link is `https://console.clickhouse.cloud/services/<SERVICE_ID>/clickstack` (substitute
`$SERVICE_ID`).

**If source detection shows nothing**, check service reachability, ingestion errors, table/schema compatibility and source settings. A successful query alone does not verify UI visibility.

---
