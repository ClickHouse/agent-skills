# ClickHouse Cloud Postgres (beta)

Managed Postgres services in ClickHouse Cloud, controlled with `clickhousectl cloud postgres`. Select the requested operation; skip creation and credential setup for an already configured service. The day-2 table covers ongoing management.

## Step 1: Authenticate

Check `clickhousectl cloud auth status` and reuse credentials that permit the requested operation. Resolve the service and organization from context. Only perform the following login flow if authentication is missing or insufficient.

Cloud Postgres write operations (create, update, delete, restore, etc.) require **API key** authentication — OAuth login is read-only. If the user has no ClickHouse Cloud account, point them to https://clickhouse.cloud (or `clickhousectl cloud auth signup`) first.

Guide the user to create an API key in the ClickHouse Cloud console (**Settings → API Keys → Create API Key**, Admin role, copy both the Key ID and Secret — the secret is shown once). Then ask them to run the login in a **separate terminal** so the secret stays out of the chat session:

```bash
clickhousectl cloud auth login --api-key <key> --api-secret <secret>
```

Alternatively, credentials can come from `CLICKHOUSE_CLOUD_API_KEY` / `CLICKHOUSE_CLOUD_API_SECRET` env vars (also picked up from a `.env` file in the current directory).

Verify:

```bash
clickhousectl cloud auth status
clickhousectl cloud org list
```

## Step 2: Create a Postgres service

Create only when a new service is requested. Resolve region, size, provider, version and HA from the requirements before execution; the values below illustrate syntax, not recommended defaults. Check the installed CLI and available service options. `--name`, `--region`, and `--size` are required in this recipe:

```bash
clickhousectl cloud postgres create \
  --name <service-name> \
  --region us-east-1 \
  --size m7i.2xlarge
```

Options to surface when relevant:
- `--provider <provider>` — cloud provider (default: `aws`)
- `--pg-version 18|17` — Postgres major version
- `--ha-type none|async|sync` — high availability
- `--tag key=value` — resource tags (repeatable)
- `--pg-config-file <path>` / `--pg-bouncer-config-file <path>` — JSON files with initial runtime config

The size is validated server-side; if the user is unsure what sizes or regions are available, check the ClickHouse Cloud console or docs rather than guessing.

Record the created service ID and poll with a bounded deadline. On timeout, inspect existing state before retrying creation. Service IDs are available from `postgres list`:

```bash
clickhousectl cloud postgres list --json
clickhousectl cloud postgres get <postgres-id> --json
```

The `get` output includes the connection endpoint details.

## Step 3: Connect

Reuse existing credentials from the project's secret mechanism. Do not reset an existing password to obtain a connection string. If initial password setup or a rotation is authorized, capture the generated output privately and coordinate updates to dependent clients:

```bash
# Substitute the resolved service ID. The output contains a credential.
( umask 177
  clickhousectl cloud postgres reset-password <postgres-id> --generate > postgres-password.private
)
chmod 600 postgres-password.private
```

Gitignore the private file before creation. Check the exit status and inspect the installed command's output format locally to store the password in the secret mechanism; do not print it into chat. Verify client connections before cleaning up the temporary secret file.

For TLS verification, fetch the CA bundle:

```bash
clickhousectl cloud postgres certs get <postgres-id> > ca.pem
```

Use the endpoint hostname from `postgres get` and validate the server certificate and hostname. Merely downloading a CA file does not enable verification. For a local `psql`, make the CA path absolute and supply credentials through the existing secret mechanism (for example a private `PGPASSFILE`):

```bash
PGSSLMODE=verify-full PGSSLROOTCERT=/absolute/path/ca.pem \
  psql --host <endpoint-host> --port <port> --username <user> --dbname <database> \
  --command 'SELECT current_database(), version()'
```

If `psql` is unavailable, `clickhousectl local postgres client --host ...` can use Docker. Check that wrapper's installed behavior before relying on it: CA/password files must be accessible inside the container and TLS settings must be forwarded. Do not fall back to unverified TLS to make the connection succeed.

## Step 4: Apply the schema

If the user developed locally first (see [local.md](local.md)), compare the migration state and compatibility, then apply the requested migration in dependency order. This copies schema, not historical data. Use the same verified connection settings, e.g.:

```bash
PGSSLMODE=verify-full PGSSLROOTCERT=/absolute/path/ca.pem \
  psql --host <endpoint-host> --port <port> --username <user> --dbname <database> \
  --set ON_ERROR_STOP=on --file schema.sql
```

## Step 5: Runtime configuration (as needed)

```bash
clickhousectl cloud postgres config get <postgres-id>          # pgConfig + pgBouncerConfig
clickhousectl cloud postgres config patch <postgres-id> ...    # change selected fields
clickhousectl cloud postgres config replace <postgres-id> ...  # replace entire config
```

Inspect the current config and intended fields first. Prefer `patch` over `replace` for targeted changes; preserve unrelated settings and check restart implications. Check `--help` on each subcommand for the exact flags.

## Day-2 operations

| Task | Command |
|------|---------|
| Resize / change HA / tags | `cloud postgres update <id> --size <size> --ha-type <type>` |
| Create a read replica | `cloud postgres read-replica create ...` |
| Promote replica to primary | `cloud postgres promote <replica-id>` |
| Planned primary/replica swap | `cloud postgres switchover <id>` |
| Point-in-time restore | `cloud postgres restore <id> --name <new-name> --restore-target 2026-04-16T12:00:00Z` |
| Restart | `cloud postgres restart <id>` |
| Delete | `cloud postgres delete <id>` |

`restore` creates a **new** service from the source's backups at the given RFC 3339 timestamp; it does not modify the source. A restore still provisions a new resource; resolve its name, target time and cost scope before running it. `delete`, `promote`, and `switchover` affect data or availability and require authorization for the identified action and target. Reuse authorization already given. For failover/restore, check readiness and client cutover requirements; do not infer an operational action from a diagnostic request. Never delete a service unless the user requested deletion of that specific service.

Verify the requested state change and application connection where relevant. Report actual results and remaining blockers without passwords. A service reaching `running` does not by itself verify a migration, replication freshness or application cutover.

References: [libpq TLS verification](https://www.postgresql.org/docs/current/libpq-ssl.html), [libpq environment variables](https://www.postgresql.org/docs/current/libpq-envars.html).
