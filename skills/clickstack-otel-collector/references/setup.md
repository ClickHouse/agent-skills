# Managed ClickStack connection setup

Check the installed CLI version and relevant `--help` before using commands whose behavior differs from these recipes. Read only the steps needed for the existing state.

## Step 2: Target and secrets

Resolve the service ID or name from the task or existing configuration. Ask only when the target is missing or ambiguous. Set `SERVICE_REF` in the shell from that context; never concatenate untrusted text into shell code. These recipes use a newly generated ingest identity; for an existing identity, keep its credentials in the existing secret mechanism and skip creation.

Create a working directory and a **`0600` env file** that will hold all configuration and
secrets for this run. The key names match exactly what the collector image reads, so this same
file is passed straight to `docker run --env-file` (or referenced by Compose) in [deployment](deployment.md). Write
it under a tight `umask` so the secret is never briefly world-readable:

```bash
WORKDIR="${WORKDIR:-$HOME/clickstack-otel-collector}"
mkdir -p "$WORKDIR" && chmod 700 "$WORKDIR"
ENV_FILE="$WORKDIR/collector.env"

# Preserve a prior run; do not rotate credentials by rerunning setup.
if [ ! -e "$ENV_FILE" ]; then
( umask 177
  {
    echo "OTLP_AUTH_TOKEN=$(openssl rand -hex 32)"
    echo "CLICKHOUSE_USER=hyperdx_ingest"
    echo "CLICKHOUSE_PASSWORD=$(openssl rand -hex 24)Aa1-"
    echo "HYPERDX_OTEL_EXPORTER_CLICKHOUSE_DATABASE=otel"
  } > "$ENV_FILE"
)
fi
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

For an existing collector, reuse its receiver authentication; no new OTLP token is needed. The generated token above is used only by the local collector recipe. These shell examples source a trusted file containing generated, shell-safe values. Do not source arbitrary imported dotenv files or write custom values into a shell script without escaping them. Preserve supplied credentials in the user's secret manager and adapt the environment-loading step to it.

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

Report the resolved target and configuration paths without secret values. Reuse a clearly specified target without asking for confirmation again. If the stored `SERVICE_ID` belongs to another target, use a separate working directory; do not combine the old credentials with a new service.

---

## Step 3: Authenticate `clickhousectl` (separate terminal by default)

Check `clickhousectl` is on `PATH`. Run this presence check **on its own**, not chained to the
installer: the `|| curl … | sh` form drags a harmless check into a compound command that sandboxes
deny wholesale as an untrusted-code download.

```bash
which clickhousectl
```

If the command is missing and installation is in scope, use the official installer under the host tool's permission policy:

```bash
curl -fsSL https://clickhouse.com/cli | sh
```

Check authentication:

```bash
clickhousectl cloud auth status
```

This skill needs **API key authentication**: OAuth is read-only and cannot create users or run
write queries. If the `API key` row is not `Active`, the user must authenticate.

**Do not ask the user to paste their API key and secret into the chat.** Instead, ask them to
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

After the user completes login, confirm with a real privileged call rather than
trusting the status table alone. Use a **ref-agnostic** call here: `SERVICE_REF` may be a name, and
`cloud service get` only accepts a UUID, so confirming with `get` would fail on a name for reasons
unrelated to auth. `cloud service list` needs no ref and proves the API key works:

```bash
clickhousectl cloud auth status
clickhousectl cloud service list --json | jq -r '.[].name'
```

If the list returns your services, you are authenticated; continue. The actual name-or-UUID
resolution of `SERVICE_REF` happens in Step 4.

If a real call fails with `No credentials found` despite active authentication, inspect the installed CLI's credential-loading behavior. Use the environment fallback below only for that failure, not as an unconditional extra copy of credentials. Keep the file private and source it only as trusted local output.

```bash
# Write a private, sourceable creds file next to collector.env.
( umask 177
  jq -r '"export CLICKHOUSE_CLOUD_API_KEY=" + (.api_key | @sh),
           "export CLICKHOUSE_CLOUD_API_SECRET=" + (.api_secret | @sh)' \
    "$HOME/.clickhouse/credentials.json" > "$WORKDIR/creds.env"
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
succeed without `creds.env`, you can skip this.)

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

Require exactly one matching service and one HTTPS endpoint before continuing; do not guess among duplicate names or use null values. Extract the values you need, coercing the port to an integer. The port serializes as a float
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

`STATE` must be `running`. If it is `starting`, wait with a bounded retry. If it is stopped, start it only when the task authorizes that action; otherwise request the missing authorization. ClickHouse Cloud services **idle-suspend**, so even a "running" service
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

Reuse an existing ingest identity when provided. Before creating the default `hyperdx_ingest` user, check whether it exists and who owns it. If it exists, verify the provided credentials; do not reset its password as part of retrying setup. A conflicting identity needs a different name (updated throughout the collector config) or a separately authorized rotation.

**Never put the plaintext password in the SQL. Hash it locally and use `sha256_hash`.** Two
problems rule out `IDENTIFIED WITH sha256_password BY '$CLICKHOUSE_PASSWORD'`: the secret would
land in the process arg list (visible in `ps`) and shell history, and, critically, **the Query API
echoes the failing statement verbatim in its error JSON**, so any error (a transient failure, a
charset slip) leaks the password into output an agent may surface. Passing it over stdin does not
help, the error echo still contains it. Instead compute the SHA-256 hash of the password locally
(`sha256_hash` stores exactly what `sha256_password` would, so the collector still logs in with the
plaintext from the env file) and put only the **hash** in the statement. The hash avoids echoing plaintext, but remains sensitive authentication material; keep it out of reports and sanitize error output:

```bash
WORKDIR="${WORKDIR:-$HOME/clickstack-otel-collector}"; ENV_FILE="$WORKDIR/collector.env"
[ -f "$WORKDIR/creds.env" ] && . "$WORKDIR/creds.env"; set -a; . "$ENV_FILE"; set +a

# SHA-256 of the password. openssl is already a dependency; this is portable (macOS + Linux).
# Only this hash ever reaches SQL, output, or `ps`; the plaintext stays in the env file.
PW_HASH=$(printf %s "$CLICKHOUSE_PASSWORD" | openssl dgst -sha256 | awk '{print $NF}')

# Send statements ONE AT A TIME: the Query API runs over HTTP and rejects multi-statement input
# ("Multi-statements are not allowed"), so a single ; -separated batch fails.
clickhousectl cloud service query --id "$SERVICE_ID" --query \
  "CREATE USER hyperdx_ingest IDENTIFIED WITH sha256_hash BY '$PW_HASH'"
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
> ([deployment](deployment.md)), verify the migration requirement for that image before extending grants beyond `otel`. If that extension is authorized, the legacy example is:
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
