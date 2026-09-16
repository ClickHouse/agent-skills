# Collector deployment recipes

For reproducible deployment, resolve an appropriate image release or digest from current official documentation and record it. `latest` below is illustrative. Keep an existing project's pin unless an upgrade is requested. Local host ports bind to loopback; choose other interfaces deliberately when remote ingestion is required.

## Step 6: Set up the collector

Follow only the sub-section matching the requested path and existing project setup. All three converge on
the same end state: a collector accepting OTLP and writing into the `otel` database on the service.
Every code block in this step assumes you have run the **standard preamble** ([setup](setup.md)) first, so
`$WORKDIR`, `$ENV_FILE`, `$SERVICE_ID`, and the secrets are set in the shell.

Make sure Docker is running (new-collector path only):

```bash
WORKDIR="${WORKDIR:-$HOME/clickstack-otel-collector}"; ENV_FILE="$WORKDIR/collector.env"
[ -f "$WORKDIR/creds.env" ] && . "$WORKDIR/creds.env"; set -a; . "$ENV_FILE"; set +a
docker info > /dev/null
```

### Step 6a: New collector with Docker Compose (`DEPLOY_MODE=compose`)

Write a Compose file in the working directory. It reads the same `collector.env` for secrets,
publishes the OTLP and health ports, and pins a named network so the telemetry generator in [verification](verification.md)
can reach the collector by container name:

```bash
cat > "$WORKDIR/docker-compose.yaml" <<'EOF'
name: clickstack
services:
  otel-collector:
    image: clickhouse/clickstack-otel-collector:latest
    container_name: clickstack-otel-collector
    env_file: ./collector.env
    ports:
      - "127.0.0.1:4317:4317"   # OTLP gRPC
      - "127.0.0.1:4318:4318"   # OTLP HTTP
      - "127.0.0.1:13133:13133" # health
    restart: unless-stopped
    networks: [clickstack-net]
networks:
  clickstack-net:
    name: clickstack-net
EOF

# Compose refuses to adopt a clickstack-net it did not create (a leftover from the docker run
# path, a prior failed Compose run, or a DEPLOY_MODE switch), failing with "network clickstack-net
# was found but has incorrect label". If an orphan exists with no containers attached, remove it so
# Compose can recreate it with its own labels.
if docker network inspect clickstack-net >/dev/null 2>&1 \
   && [ -z "$(docker network inspect clickstack-net -f '{{range .Containers}}{{.Name}} {{end}}')" ]; then
  docker network rm clickstack-net
fi

( cd "$WORKDIR" && docker compose up -d )
```

Compose creates the `clickstack-net` network for you (the guard above clears an orphaned one from a
prior run first). Skip to **Step 6d** to confirm health.

### Step 6b: New collector with individual Docker commands (`DEPLOY_MODE=run`)

Create a user-defined network so the telemetry generator in [verification](verification.md) can reach the collector by
container name:

```bash
docker network create clickstack-net 2>/dev/null || true
```

Start a new collector, passing secrets via `--env-file`. Inspect an existing container with the same name first; reuse it or choose a new name. Replacement stops ingestion and requires that action to be in scope:

```bash
docker run -d \
  --name clickstack-otel-collector \
  --network clickstack-net \
  --env-file "$ENV_FILE" \
  -p 127.0.0.1:4317:4317 \
  -p 127.0.0.1:4318:4318 \
  -p 127.0.0.1:13133:13133 \
  clickhouse/clickstack-otel-collector:latest
```

The image reads `OTLP_AUTH_TOKEN`, `CLICKHOUSE_ENDPOINT`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`,
and `HYPERDX_OTEL_EXPORTER_CLICKHOUSE_DATABASE` from the env file. It enables bearer-token auth on
the OTLP receiver with an empty scheme, so callers send the raw token as the `authorization` header
(no `Bearer ` prefix). Continue to **Step 6d**.

### Step 6c: Configure your existing collector (`COLLECTOR_PATH=existing`)

Add the ClickHouse exporter to your existing collector configuration. The config below matches the
behavior of the ClickStack distribution, including the Session Replay (`rrweb`) routing path, and
writes into the `otel` database the ClickStack UI expects.

**Reference the endpoint and password as environment variables (`${env:…}`), do not hardcode them
into the config file.** The contrib collector expands `${env:VAR}` at load time, so keeping the
plaintext password out of the config file is both safer and consistent with the rest of this skill.
Start your collector with the env vars available, the simplest way is the same `--env-file` the
local collector uses:

```bash
# When running the contrib collector in Docker, pass collector.env so ${env:CLICKHOUSE_*} resolve:
#   docker run -d --env-file "$ENV_FILE" -p 127.0.0.1:4317:4317 -p 127.0.0.1:4318:4318 \
#     -v "$WORKDIR/your-config.yaml:/etc/otelcol-contrib/config.yaml:ro" \
#     otel/opentelemetry-collector-contrib:latest
# For a non-Docker collector, export CLICKHOUSE_ENDPOINT and CLICKHOUSE_PASSWORD into its
# environment (e.g. an EnvironmentFile= in the systemd unit) before it starts.
```

The following is a complete example topology, not a patch to append blindly. Preserve existing receivers, authentication, ports, processors, routing and exporters. Add only the exporter and pipeline changes needed; include Session Replay routing only when requested. Check component availability and validate the merged config with the installed collector before an authorized reload:

```yaml
receivers:
  otlp/hyperdx:
    protocols:
      grpc:
        include_metadata: true
        endpoint: "0.0.0.0:4317"
      http:
        cors:
          allowed_origins: ["*"]
          allowed_headers: ["*"]
        include_metadata: true
        endpoint: "0.0.0.0:4318"

processors:
  batch:
  memory_limiter:
    limit_mib: 1500
    spike_limit_mib: 512
    check_interval: 5s

connectors:
  routing/logs:
    default_pipelines: [logs/out-default]
    error_mode: ignore
    table:
      - context: log
        statement: route() where IsMatch(attributes["rr-web.event"], ".*")
        pipelines: [logs/out-rrweb]

exporters:
  clickhouse:
    database: otel
    endpoint: ${env:CLICKHOUSE_ENDPOINT}
    username: hyperdx_ingest
    password: ${env:CLICKHOUSE_PASSWORD}
    ttl: 720h
    timeout: 5s
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
      max_elapsed_time: 300s
  clickhouse/rrweb:
    database: otel
    endpoint: ${env:CLICKHOUSE_ENDPOINT}
    username: hyperdx_ingest
    password: ${env:CLICKHOUSE_PASSWORD}
    ttl: 720h
    logs_table_name: hyperdx_sessions
    timeout: 5s
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
      max_elapsed_time: 300s

service:
  pipelines:
    traces:
      receivers: [otlp/hyperdx]
      processors: [memory_limiter, batch]
      exporters: [clickhouse]
    metrics:
      receivers: [otlp/hyperdx]
      processors: [memory_limiter, batch]
      exporters: [clickhouse]
    logs/in:
      receivers: [otlp/hyperdx]
      exporters: [routing/logs]
    logs/out-default:
      receivers: [routing/logs]
      processors: [memory_limiter, batch]
      exporters: [clickhouse]
    logs/out-rrweb:
      receivers: [routing/logs]
      processors: [memory_limiter, batch]
      exporters: [clickhouse/rrweb]
```

Notes for this path:

- If you use your own distribution, ensure it includes the ClickHouse exporter. The upstream
  [contrib image](https://github.com/open-telemetry/opentelemetry-collector-contrib) already does.
- Authentication on the OTLP receivers is your existing setup. The `OTLP_AUTH_TOKEN` generated in
  [setup](setup.md) is not used here unless you wire it into your own auth (for example `bearertokenauth`).
- After reloading, skip the health check below (that is specific to the local container) and go
  to [verification](verification.md) using existing traffic or an authorized test burst (point the generator at your own collector's
  OTLP endpoint).

### Step 6d: Confirm the local collector is healthy (new-collector path)

```bash
docker ps --filter name=clickstack-otel-collector --format '{{.Status}}'
curl -fsS http://localhost:13133/ && echo
docker logs --tail 40 clickstack-otel-collector 2>&1 | tail -40
```

A healthy start shows the seed migrations running to completion (`[seed] OK ...` lines ending in
`goose: up to current file version: N`), then `Everything is ready. Begin running and processing
data.` (or equivalent), `docker ps` reporting `Up ... (healthy)`, and the health check returning
HTTP 200. A seed line like `ClickHouse 25.12 < 26.2, falling back to compatibility logs and traces
schemas` on an older server version is **expected and harmless**, not an error; do not pause on it.
If instead the container exits, inspect the failing stage. These are examples of causes, not exhaustive diagnoses:

- `code: 516, Authentication failed: password is incorrect` -> `CLICKHOUSE_PASSWORD` is empty or
  wrong in the env file. The most common slip is storing the password under a different key name
  (it **must** be `CLICKHOUSE_PASSWORD`), or using a password containing `@ : / ? # %`, which
  corrupts the migration tool's connection URL.
- `[HTTP 403]` / `data size should be 0 < <huge number>` at "server hello" -> check authentication, endpoint protocol, proxy and network responses; this message alone does not establish a password failure.
- TLS / dial errors -> `CLICKHOUSE_ENDPOINT` is malformed (it must be `https://<host>:8443`, with
  no `.0` on the port).
- `ACCESS_DENIED` referencing `default` -> inspect the image's migration requirements; see the legacy grant note in [setup](setup.md).

---
