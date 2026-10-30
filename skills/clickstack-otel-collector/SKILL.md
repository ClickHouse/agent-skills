---
name: clickstack-otel-collector
description: Use when a user wants to wire an OpenTelemetry collector into a Managed ClickStack service on ClickHouse Cloud, either by deploying a new local collector (Docker run or Docker Compose) or by configuring their own existing collector, then send rich synthetic telemetry and verify it is visible in ClickStack.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.6.0"
---

# Set up an OpenTelemetry collector for Managed ClickStack

This skill wires an OpenTelemetry collector into a Managed ClickStack service running on
ClickHouse Cloud, sends rich synthetic telemetry through it, and confirms the data is actually
visible in ClickStack. It uses [`clickhousectl`](https://clickhouse.com/docs/interfaces/cli)
for all cloud and SQL operations.

**Scope.** This skill supports two paths, chosen in Step 0:

1. **Deploy a new collector** locally. You can do this **two ways: individual `docker` commands,
   or a `docker compose` file** (recommended, fewer commands and one file to start/stop). Make the
   user aware of both up front and let them pick in Step 0; do not assume plain `docker`. Either
   way runs the ClickStack distribution of the collector, preconfigured for Managed ClickStack.
2. **Configure your own existing collector** by adding the ClickHouse exporter configuration.
   We give you the exact config to drop in; you reload your collector. Use this if you already
   run a collector in a **gateway** role.

A full Kubernetes deployment (Helm, secrets in K8s Secrets) is out of scope here; the config
we generate in path 2 can be applied to a collector running anywhere.

The end state is:

- A dedicated `hyperdx_ingest` SQL user on the target service, with exactly the grants the
  collector needs (it creates the `otel.*` schema on first write).
- A collector forwarding logs, traces, and metrics into the `otel` database on the service,
  either the new local ClickStack collector or your existing one.
- Rich synthetic telemetry across several services, severities, span statuses, and metric
  types, so ClickStack's Search, Service Map, and dashboards have something real to show.
- The service confirmed **awake**, and the user walked through the ClickStack onboarding in the
  Cloud console so they can actually *see* their data.

Secrets (the OTLP auth token and the SQL password) are generated locally, written **once** to a
`0600` env file, and passed to Docker via `--env-file`. They are never pasted into the chat,
never passed with `docker run -e`, and never echoed back after creation.

Follow these steps in order. Each step depends on state established by the previous one.

---

## Step 0: Choose your path

Ask the user two short questions before doing anything else, because they determine which later
steps run.

**Question 1: Do you already have an OpenTelemetry collector running in a gateway role?**

- **No, set one up for me.** -> the **new-collector** path. Continue to Question 2.
- **Yes, I have one.** -> the **existing-collector** path. Skip Question 2 (it does not apply),
  and in Step 6 you will configure their collector rather than deploy a new one.

**Question 2 (new-collector path only): Run the collector with individual Docker commands, or a
Docker Compose file?**

- **Docker Compose (recommended).** Fewer commands, one file to start and stop, easiest to
  re-run. Best if `docker compose` is available.
- **Individual Docker commands.** Use if Compose is not installed or you prefer explicit
  commands.

Record the answers as `COLLECTOR_PATH` (`new` or `existing`) and, for the new path,
`DEPLOY_MODE` (`compose` or `run`). Refer back to them in Step 6 and Step 7.

---

## Step 1: Batch the permissions up front

Coding agents prompt for approval the first time they see each shell command. To avoid
interrupting the user every few steps, ask them once, up front, to allowlist the command
prefixes below (the "always allow for this project / session" option in their agent). There are
no destructive operations and nothing targets anything outside this project or their ClickHouse
Cloud service.

| Command prefix | Used for | Needed when |
| --- | --- | --- |
| `openssl rand …` | generate the OTLP token and SQL password | always |
| `clickhousectl cloud …` | auth, resolve the service, run SQL via the Query API | always |
| `jq …` | parse JSON from `clickhousectl` | always |
| `docker …` / `docker compose …` | run/inspect the collector and the telemetry generator | new-collector path, and the optional telemetry check |
| `curl …` | local health check against `localhost:13133` (and installing `clickhousectl` if missing) | new-collector path |

Tell the user, in your own words: *"If your agent supports it, choose 'always allow' for each
of these the first time it asks. The whole run is read-only against your machine except for the
collector container, and write operations against ClickHouse are limited to creating the ingest
user and the `otel` schema."*

If the user is on the existing-collector path and does not want to run the optional telemetry
check, you can drop `docker` and `curl` from the list.

**Two approvals are semantic, not prefix-based, so allowlisting won't pre-clear them.** Warn the
user to expect these and approve them explicitly when they appear:

- The `clickhousectl` install in Step 3 uses `curl … | sh`, which many agent sandboxes flag as
  "downloading and running untrusted code" regardless of any `curl` allowlist rule.
- The `CREATE USER` / `GRANT` in Step 5 may be flagged as "modifying shared production
  infrastructure," again independent of the `clickhousectl` prefix rule.

Neither is solved by the table above; they are one-time, intentional, and safe to approve.

Then continue.

---

## Step 2: Confirm the target service and lay down the secrets file

The user's prompt contains a service identifier, either a service ID (UUID) or a service name.
Treat that value as `SERVICE_REF`.

Create a working directory and a **`0600` env file** that will hold all configuration and
secrets for this run. The key names match exactly what the collector image reads, so this same
file is passed straight to `docker run --env-file` (or referenced by Compose) in Step 6. Write
it under a tight `umask` so the secret is never briefly world-readable:

```bash
WORKDIR="${WORKDIR:-$HOME/clickstack-otel-collector}"
mkdir -p "$WORKDIR" && chmod 700 "$WORKDIR"
ENV_FILE="$WORKDIR/collector.env"

# Generate secrets WITHOUT printing them; write straight into a private file.
( umask 177
  {
    echo "SERVICE_REF=$SERVICE_REF"
    echo "OTLP_AUTH_TOKEN=$(openssl rand -hex 32)"
    echo "CLICKHOUSE_USER=hyperdx_ingest"
    echo "CLICKHOUSE_PASSWORD=$(openssl rand -hex 24)Aa1-"
    echo "HYPERDX_OTEL_EXPORTER_CLICKHOUSE_DATABASE=otel"
  } > "$ENV_FILE"
)
chmod 600 "$ENV_FILE"
ls -l "$ENV_FILE"
```

Two things about these values matter and are easy to get wrong:

- **Key names are exact.** The collector reads `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`,
  `CLICKHOUSE_ENDPOINT`, and `HYPERDX_OTEL_EXPORTER_CLICKHOUSE_DATABASE`. Store the SQL password
  under `CLICKHOUSE_PASSWORD` (not a custom name); if it is missing, the collector starts with an
  **empty** password and dies with `code: 516, Authentication failed`.
- **The password charset is constrained from three directions at once.** ClickHouse Cloud rejects
  passwords without at least one uppercase character and one special character, so a plain hex
  string fails at `CREATE USER`. At the same time, the collector's migration tool embeds the
  password in a connection URL, so `@`, `:`, `/`, `?`, `#`, and `%` corrupt it (symptom:
  `code: 516` at startup even though the password is "correct"). The recipe above is random hex
  (lowercase + digits) plus the suffix `Aa1-`, which adds the required uppercase, a digit, and a
  **URL-unreserved** special character (`-`). The OTLP token has no such rules (it is just a
  bearer token), so plain hex is fine for it.

The env file uses **bare `KEY=VALUE` lines with no quotes**: Docker's `--env-file` does not do
shell parsing, so any quotes you add become part of the value.

On the **existing-collector path** the `OTLP_AUTH_TOKEN` is not used by your collector (auth on
your receiver is your own setup); it is generated only so the same file works if you later switch
to the local collector. The `CLICKHOUSE_*` values are still used: they go into the exporter
config you add to your collector in Step 6.

**Every later step runs in a fresh shell, so `WORKDIR`, `ENV_FILE`, and any exported credentials do
not persist, and `WORKDIR`/`ENV_FILE` are not stored inside the env file, so sourcing it can't
recover them.** Begin each subsequent step's shell with this **standard preamble**, which
re-derives the paths from the deterministic default, loads the saved credentials (Step 3), and
loads the config:

```bash
WORKDIR="${WORKDIR:-$HOME/clickstack-otel-collector}"; ENV_FILE="$WORKDIR/collector.env"
[ -f "$WORKDIR/creds.env" ] && . "$WORKDIR/creds.env"; set -a; . "$ENV_FILE"; set +a
```

If you chose a non-default `WORKDIR`, set it explicitly at the top of every step (the `${WORKDIR:-…}`
default only covers the standard location). Later steps refer to this as "the standard preamble".

**Confirm with the user** that `SERVICE_REF` is correct. Tell them the working directory and that
`collector.env` (mode `0600`) now holds the OTLP token and the SQL password. Do **not** print
either secret. If they want to see a value, point them at the file
(`grep OTLP_AUTH_TOKEN "$ENV_FILE"`).

If the user supplied their own token or password, write those into the file instead of the
generated ones, but keep the same `0600` discipline and make sure any custom password still meets
the charset rules above.

---

## Step 3: Authenticate `clickhousectl` (separate terminal by default)

Check `clickhousectl` is on `PATH`. Run this presence check **on its own**, not chained to the
installer: the `|| curl … | sh` form drags a harmless check into a compound command that sandboxes
deny wholesale as an untrusted-code download.

```bash
which clickhousectl
```

Only if that prints nothing, install it (the user may need to approve this explicitly, see Step 1):

```bash
curl -fsSL https://clickhouse.com/cli | sh
```

Check authentication:

```bash
clickhousectl cloud auth status
```

This skill needs **API key authentication**: OAuth is read-only and cannot create users or run
write queries. If the `API key` row is not `Active`, the user must authenticate.

**Do not ask the user to paste their API key and secret into the chat.** Anything pasted into the
conversation lives in the transcript and has to be rotated afterward. Instead, ask them to
authenticate in a **separate terminal**, then tell you when they are done:

> I need a ClickHouse Cloud **Admin** API key to create the ingest user and verify the data.
> Please don't paste it here. Instead:
>
> 1. In the [Cloud console](https://console.clickhouse.cloud), open **Organization → API keys
>    → New API key**, and give it the **Admin** role. (Developer-scoped keys can't provision the
>    per-service Query API endpoint that `cloud service query` uses.)
> 2. In a **separate terminal**, run:
>
>    ```bash
>    clickhousectl cloud auth login --api-key <key-id> --api-secret <key-secret>
>    ```
>
> 3. Tell me when that's done and I'll re-check the auth status.

Poll until the API key row reports `Active`, then confirm with a real privileged call rather than
trusting the status table alone. Use a **ref-agnostic** call here: `SERVICE_REF` may be a name, and
`cloud service get` only accepts a UUID, so confirming with `get` would fail on a name for reasons
unrelated to auth. `cloud service list` needs no ref and proves the API key works:

```bash
clickhousectl cloud auth status
clickhousectl cloud service list --json | jq -r '.[].name'
```

If the list returns your services, you are authenticated; continue. The actual name-or-UUID
resolution of `SERVICE_REF` happens in Step 4.

**Expect to need the env-var credentials (common, not an edge case).** Many `clickhousectl` builds
save the credentials file but a freshly spawned shell (such as the one your tool calls run in)
doesn't read it, so `auth status` shows `Active` yet the very next `clickhousectl` call reports
`No credentials found`. Rather than treat this as a rare fallback, write a small **sourceable
creds file** once, then load it in every later shell. This keeps each subsequent shell to a single
`.` line instead of two `jq` re-derivations, and keeps the secret out of the chat:

```bash
# Write a private, sourceable creds file next to collector.env.
( umask 177
  { echo "export CLICKHOUSE_CLOUD_API_KEY=$(jq -r .api_key    "$HOME/.clickhouse/credentials.json")"
    echo "export CLICKHOUSE_CLOUD_API_SECRET=$(jq -r .api_secret "$HOME/.clickhouse/credentials.json")"
  } > "$WORKDIR/creds.env"
)
chmod 600 "$WORKDIR/creds.env"
```

**From now on, open every shell that calls `clickhousectl` with both loads**, because env vars do
not persist across shells:

```bash
. "$WORKDIR/creds.env"; set -a; . "$ENV_FILE"; set +a
```

Re-run the `service list` check above with the creds loaded; it should now succeed. Do not continue
until a real call works. (If `clickhousectl auth status` already shows `API key … Active` and calls
succeed without `creds.env`, you can skip this; but most agent shells need it.)

---

## Step 4: Resolve the service and capture the HTTPS endpoint

Run the standard preamble (Step 2) so the paths, credentials, and config are all loaded in this
shell, then resolve the service. If `SERVICE_REF` is a UUID, use it directly; otherwise look it up
by name:

```bash
WORKDIR="${WORKDIR:-$HOME/clickstack-otel-collector}"; ENV_FILE="$WORKDIR/collector.env"
[ -f "$WORKDIR/creds.env" ] && . "$WORKDIR/creds.env"; set -a; . "$ENV_FILE"; set +a
```

```bash
# UUID form
clickhousectl cloud service get "$SERVICE_REF" --json > "$WORKDIR/svc.json"

# Name form (note the double quotes: service names can contain spaces or apostrophes,
# e.g. "Alex's test")
clickhousectl cloud service list --json \
  | jq --arg n "$SERVICE_REF" '.[] | select(.name==$n)' > "$WORKDIR/svc.json"
```

Extract the values you need, coercing the port to an integer. The port serializes as a float
(`8443.0`); if `:8443.0` leaks into the endpoint the collector's ClickHouse exporter cannot dial
it:

```bash
SERVICE_ID=$(jq -r '.id' "$WORKDIR/svc.json")
SERVICE_NAME=$(jq -r '.name' "$WORKDIR/svc.json")
STATE=$(jq -r '.state' "$WORKDIR/svc.json")
CLICKHOUSE_ENDPOINT=$(jq -r '.endpoints[] | select(.protocol=="https")
  | "https://\(.host):\(.port | tonumber | floor)"' "$WORKDIR/svc.json")

# Persist the resolved values back into the env file for later steps and docker --env-file.
# Append only if the key is not already present, so a second run does not duplicate lines.
grep -q '^SERVICE_ID=' "$ENV_FILE" || echo "SERVICE_ID=$SERVICE_ID" >> "$ENV_FILE"
grep -q '^CLICKHOUSE_ENDPOINT=' "$ENV_FILE" || echo "CLICKHOUSE_ENDPOINT=$CLICKHOUSE_ENDPOINT" >> "$ENV_FILE"
printf 'service=%q state=%s endpoint=%s\n' "$SERVICE_NAME" "$STATE" "$CLICKHOUSE_ENDPOINT"
```

`STATE` must be `running`. If it is `stopped` or `starting`, ask the user to start the service (or
wait), and do not proceed. ClickHouse Cloud services **idle-suspend**, so even a "running" service
can be asleep; the next query both checks reachability and wakes it:

```bash
clickhousectl cloud service query --id "$SERVICE_ID" --query "SELECT version()"
```

A successful response confirms the service is awake and that the per-service Query API key is
provisioned. On the first call `clickhousectl` prints `Provisioning Query API endpoint + key for
service '<name>'...`, which is expected.

---

## Step 5: Create the `hyperdx_ingest` SQL user and grant it `otel.*`

This step is the same on both paths: the collector (new or existing) authenticates to ClickHouse
as `hyperdx_ingest`. Open the shell with the combined load so `$CLICKHOUSE_PASSWORD` (and
credentials) are set.

> **Expect an approval prompt here.** The `CREATE USER` / `GRANT` statements below are DDL against
> a Cloud service, so some agent sandboxes flag them as "modifying shared production
> infrastructure" even when `clickhousectl` is allowlisted. This is expected; the operations are
> scoped to a single dedicated ingest user and the `otel` schema, and the user should approve them
> explicitly when prompted.

**Never put the plaintext password in the SQL. Hash it locally and use `sha256_hash`.** Two
problems rule out `IDENTIFIED WITH sha256_password BY '$CLICKHOUSE_PASSWORD'`: the secret would
land in the process arg list (visible in `ps`) and shell history, and, critically, **the Query API
echoes the failing statement verbatim in its error JSON**, so any error (a transient failure, a
charset slip) leaks the password into output an agent may surface. Passing it over stdin does not
help, the error echo still contains it. Instead compute the SHA-256 hash of the password locally
(`sha256_hash` stores exactly what `sha256_password` would, so the collector still logs in with the
plaintext from the env file) and put only the **hash** in the statement. A hash is non-reversible,
so even an echoed error cannot leak the password:

```bash
WORKDIR="${WORKDIR:-$HOME/clickstack-otel-collector}"; ENV_FILE="$WORKDIR/collector.env"
[ -f "$WORKDIR/creds.env" ] && . "$WORKDIR/creds.env"; set -a; . "$ENV_FILE"; set +a

# SHA-256 of the password. openssl is already a dependency; this is portable (macOS + Linux).
# Only this hash ever reaches SQL, output, or `ps`; the plaintext stays in the env file.
PW_HASH=$(printf %s "$CLICKHOUSE_PASSWORD" | openssl dgst -sha256 | awk '{print $NF}')

# Send statements ONE AT A TIME: the Query API runs over HTTP and rejects multi-statement input
# ("Multi-statements are not allowed"), so a single ; -separated batch fails.
clickhousectl cloud service query --id "$SERVICE_ID" --query \
  "CREATE USER IF NOT EXISTS hyperdx_ingest IDENTIFIED WITH sha256_hash BY '$PW_HASH'"
# Re-run safe: force the password to this run's value if the user already existed.
clickhousectl cloud service query --id "$SERVICE_ID" --query \
  "ALTER USER hyperdx_ingest IDENTIFIED WITH sha256_hash BY '$PW_HASH'"
```

Grant the least privilege the collector needs to create and write the `otel.*` schema. On the
current image the schema migrations and their version table also live in `otel`, so `otel.*` is
sufficient (this statement carries no secret):

```bash
clickhousectl cloud service query --id "$SERVICE_ID" --query \
  "GRANT SELECT, INSERT, CREATE DATABASE, CREATE TABLE, CREATE VIEW ON otel.* TO hyperdx_ingest"
```

> **Older image builds:** some earlier collector versions ran their goose migrations against a
> version table in the `default` database, so startup looped on `ACCESS_DENIED` until `default.*`
> was also granted. If you see `ACCESS_DENIED` referencing `default` in the collector logs
> (Step 6), add this and restart the container:
>
> ```bash
> clickhousectl cloud service query --id "$SERVICE_ID" --query \
>   "GRANT SELECT, INSERT, CREATE TABLE ON default.* TO hyperdx_ingest"
> ```

Verify:

```bash
clickhousectl cloud service query --id "$SERVICE_ID" --query "SHOW GRANTS FOR hyperdx_ingest"
```

You should see `GRANT SELECT, INSERT, CREATE DATABASE, CREATE TABLE, CREATE VIEW ON otel.* TO
hyperdx_ingest`.

---

## Step 6: Set up the collector

Follow the sub-section that matches the path and mode you chose in Step 0. All three converge on
the same end state: a collector accepting OTLP and writing into the `otel` database on the service.
Every code block in this step assumes you have run the **standard preamble** (Step 2) first, so
`$WORKDIR`, `$ENV_FILE`, `$SERVICE_ID`, and the secrets are set in the shell.

Make sure Docker is running (new-collector path only):

```bash
WORKDIR="${WORKDIR:-$HOME/clickstack-otel-collector}"; ENV_FILE="$WORKDIR/collector.env"
[ -f "$WORKDIR/creds.env" ] && . "$WORKDIR/creds.env"; set -a; . "$ENV_FILE"; set +a
docker info > /dev/null
```

### Step 6a: New collector with Docker Compose (`DEPLOY_MODE=compose`)

Write a Compose file in the working directory. It reads the same `collector.env` for secrets,
publishes the OTLP and health ports, and pins a named network so the telemetry generator in Step 7
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
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
      - "13133:13133" # health
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

Create a user-defined network so the telemetry generator in Step 7 can reach the collector by
container name:

```bash
docker network create clickstack-net 2>/dev/null || true
```

Start the collector, passing **all secrets via `--env-file`** (never `-e`, which would put the
secret on the command line, in shell history, and in `ps`). The `docker rm -f` first makes the step
safe to re-run:

```bash
docker rm -f clickstack-otel-collector 2>/dev/null || true
docker run -d \
  --name clickstack-otel-collector \
  --network clickstack-net \
  --env-file "$ENV_FILE" \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 13133:13133 \
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
#   docker run -d --env-file "$ENV_FILE" -p 4317:4317 -p 4318:4318 \
#     -v "$WORKDIR/your-config.yaml:/etc/otelcol-contrib/config.yaml:ro" \
#     otel/opentelemetry-collector-contrib:latest
# For a non-Docker collector, export CLICKHOUSE_ENDPOINT and CLICKHOUSE_PASSWORD into its
# environment (e.g. an EnvironmentFile= in the systemd unit) before it starts.
```

Add this to your collector config and reload it:

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
  Step 2 is not used here unless you wire it into your own auth (for example `bearertokenauth`).
- After reloading, skip the health check below (that is specific to the local container) and go
  straight to **Step 7** to send a verification burst (point the generator at your own collector's
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
If instead the container exits, the cause is almost always in the seed step:

- `code: 516, Authentication failed: password is incorrect` -> `CLICKHOUSE_PASSWORD` is empty or
  wrong in the env file. The most common slip is storing the password under a different key name
  (it **must** be `CLICKHOUSE_PASSWORD`), or using a password containing `@ : / ? # %`, which
  corrupts the migration tool's connection URL.
- `[HTTP 403]` / `data size should be 0 < <huge number>` at "server hello" -> same root cause: an
  empty/wrong password against the HTTPS endpoint.
- TLS / dial errors -> `CLICKHOUSE_ENDPOINT` is malformed (it must be `https://<host>:8443`, with
  no `.0` on the port).
- `ACCESS_DENIED` referencing `default` -> only on older image builds; apply the `default.*` grant
  from the Step 5 note and restart.

---

## Step 7: Send rich synthetic telemetry and verify ingestion

Use `telemetrygen` (the OpenTelemetry Collector Contrib generator) from its **Docker image**, so
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
TG_LOG="$WORKDIR/telemetrygen.log"; : > "$TG_LOG"

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

**Judge success by exit code and row counts, never by the generator's logs.** Two reasons. First,
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
deployment.environment="production"`, bash strips the quotes and the container receives
`deployment.environment=production`, which hard-fails. Wrap the **whole argument in single quotes**
so the inner double quotes reach the container, exactly as the `tg` helper already does for the
auth header.

Logs across two services with different severities and bodies, including an error line:

```bash
tg logs --service checkout --severity-text Info  --severity-number 9 \
  --body "checkout completed" \
  --otlp-attributes 'deployment.environment="production"' \
  --telemetry-attributes 'http.method="POST"'
tg logs --service payment  --severity-text Error --severity-number 17 \
  --body "payment gateway timeout" \
  --otlp-attributes 'deployment.environment="production"' \
  --telemetry-attributes 'http.status_code="500"'
```

Traces with child spans, a healthy service and an erroring one (this is what populates the Service
Map and the error views):

```bash
tg traces --service checkout --child-spans 4 --span-duration 120ms --status-code Ok \
  --otlp-attributes 'deployment.environment="production"' \
  --telemetry-attributes 'http.route="/cart"'
tg traces --service payment  --child-spans 3 --span-duration 400ms --status-code Error \
  --otlp-attributes 'deployment.environment="production"' \
  --telemetry-attributes 'http.route="/charge"'
```

Metrics across the three common types, so dashboards have gauges, counters, and a distribution:

```bash
tg metrics --service checkout --metric-type Sum
tg metrics --service checkout --metric-type Gauge
tg metrics --service payment  --metric-type Histogram
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

You should see non-zero `rows` for `otel_logs`, `otel_traces`, `otel_metrics_sum`,
`otel_metrics_gauge`, and `otel_metrics_histogram`. If a signal is missing:

1. Tail the collector logs (`docker logs --tail 50 clickstack-otel-collector`) for export errors.
2. Confirm the `authorization` header matches `$OTLP_AUTH_TOKEN`: `grep -c Unauthenticated
   "$TG_LOG"` (a non-zero count means a mismatch, the full message is `code = Unauthenticated desc =
   provided authorization does not match expected scheme or token`). Grep rather than print the
   log, since it contains the token.
3. Re-check `CLICKHOUSE_ENDPOINT` has the `https://` scheme and `:8443` port.
4. Some metric kinds flush slowly. Re-run the count after another 30 seconds before declaring
   failure.

Do not proceed until every expected signal has non-zero rows.

---

## Step 8: Confirm the service is awake, then complete onboarding in ClickStack

Rows in ClickHouse are **not** the same as the user seeing telemetry in ClickStack. The ClickStack
UI requires a one-time onboarding step that auto-detects the data sources, and that step fails if
the ClickHouse service has idle-suspended in the meantime.

**First, confirm the service is awake.** Do not skip this; it is the most common reason onboarding
shows no sources. Run a real query and require it to succeed:

```bash
clickhousectl cloud service query --id "$SERVICE_ID" --query "SELECT 1"
```

If this returns `1`, the service is awake; continue immediately to the console steps below while it
stays warm. If it errors or times out, the service was asleep and this call is waking it: wait a
few seconds and re-run until it returns `1`. Only proceed once it succeeds.

**Then walk the user through onboarding explicitly.** Do not just say "done"; spell out each click,
because the sources only appear after this flow is completed:

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

**If source detection shows nothing**, the service almost certainly idle-suspended between the data
send and the console step. Re-run the `SELECT 1` wake query above for the user, then have them
re-run the detection, rather than leaving them to debug an opaque failure.

---

## Step 9: Summarize and hand off (without echoing secrets)

Print a summary in roughly this format. Note the token is **referenced, not printed**, the SQL
password is not shown at all, and the collector keeps running until the user stops it. Adjust the
"how to stop" line to the deploy mode they chose.

```
✅ ClickStack is set up and ingesting telemetry for service <SERVICE_NAME> (<SERVICE_ID>).
   Complete onboarding in the console (Step 8) to auto-detect the sources and see your data.

Collector
  ▸ New local collector via <Docker Compose | docker run>  (or: configured your existing collector)
  ▸ Send OTLP gRPC to: localhost:4317
  ▸ Send OTLP HTTP to: localhost:4318
  ▸ Health check:      http://localhost:13133/   (local collector only)
  ▸ Required header:   authorization: <OTLP token>
       (retrieve with:  grep OTLP_AUTH_TOKEN <WORKDIR>/collector.env)

ClickHouse target
  ▸ Endpoint: <CLICKHOUSE_ENDPOINT>
  ▸ SQL user: hyperdx_ingest   (password in <WORKDIR>/collector.env, mode 0600)
  ▸ Database: otel

Finish in the ClickHouse Cloud console:
  ▸ Open the service, select ClickStack in the left menu, then Getting Started,
    and complete onboarding to auto-detect sources.
  ▸ https://console.clickhouse.cloud/services/<SERVICE_ID>/clickstack
```

Then tell the user, in your own words, that:

1. All secrets live in `<WORKDIR>/collector.env` (mode `0600`). Nothing sensitive was pasted into
   this chat or passed on a `docker run` command line.
2. The collector keeps running until they stop it. For Compose:
   `cd <WORKDIR> && docker compose down` stops it, `docker compose up -d` brings it back. For
   individual Docker: `docker stop clickstack-otel-collector` and `docker start
   clickstack-otel-collector`.
3. Any application, SDK, or agent on this host can now send OTLP to `localhost:4317` (gRPC) or
   `localhost:4318` (HTTP) with the `authorization` header from the env file.
4. The ClickHouse Cloud service idle-suspends. If ClickStack later shows no recent data, the
   service may simply be asleep; sending new telemetry or running any query wakes it.

---

## Cleanup (only if the user explicitly asks)

```bash
# Docker Compose deployment:
( cd "$WORKDIR" && docker compose down )

# Individual Docker deployment:
docker rm -f clickstack-otel-collector
docker network rm clickstack-net 2>/dev/null || true

# Either deployment, remove the ingest user:
clickhousectl cloud service query --id "$SERVICE_ID" --query "DROP USER IF EXISTS hyperdx_ingest"

# Optionally remove the local files once they are no longer needed:
# rm -f "$WORKDIR/collector.env" "$WORKDIR/svc.json" "$WORKDIR/docker-compose.yaml"
```

Do **not** drop the `otel` database: it contains telemetry the user may want to retain.
