# ClickHouse Cloud Postgres (beta)

Managed Postgres services in ClickHouse Cloud, controlled with `clickhousectl cloud postgres`. Follow these steps in order; the day-2 operations table at the end covers ongoing management.

## Step 1: Authenticate

Cloud Postgres write operations (create, update, delete, restore, etc.) require **API key** authentication — OAuth login is read-only. If the user has no ClickHouse Cloud account, point them to https://clickhouse.cloud (or `clickhousectl cloud auth signup`) first.

Guide the user to create an API key in the ClickHouse Cloud console (**Settings → API Keys → Create API Key**, Admin role, copy both the Key ID and Secret — the secret is shown once). Then ask them to run the login in a **separate terminal** so the secret stays out of the chat session. `--interactive` prompts for both values:

```bash
clickhousectl cloud auth login --interactive
```

Or pass them as flags: `clickhousectl cloud auth login --api-key <key> --api-secret <secret>`. A key the API rejects is not saved and the login exits 4.

Alternatively, credentials can come from `CLICKHOUSE_CLOUD_API_KEY` / `CLICKHOUSE_CLOUD_API_SECRET` env vars (also picked up from a `.env` file in the current directory). Precedence, first wins: `--api-key`/`--api-secret` flags, saved API keys, env vars, OAuth.

Verify:

```bash
clickhousectl cloud auth status
clickhousectl cloud auth whoami
```

`auth status` always exits 0, so read whether it reports the credentials as verified. `auth whoami` lists the user's organizations and exits 4 if the credentials are rejected. If the user has more than one organization, pass `--org-id <id>` to cloud commands.

## Step 2: Create a Postgres service

`--name`, `--region`, and `--size` are required:

```bash
clickhousectl cloud postgres create \
  --name <service-name> \
  --region us-east-1 \
  --size c6gd.xlarge \
  --pg-version 18
```

Options to surface when relevant:
- `--provider aws|gcp` — cloud provider (default: `aws`; GCP is in private preview and uses GCP region and size names)
- `--pg-version 18|17` — Postgres major version
- `--ha-type none|async|sync` — high availability
- `--ip-allow <IP_OR_CIDR:PORTS[=DESCRIPTION]>` — IPv4 access rule (repeatable); `PORTS` is `5432` (Postgres), `6432` (PgBouncer), or a range like `5432..6432`
- `--block-public-access` — create with no access rules
- `--tag key=value` — resource tags (repeatable)
- `--pg-config-file <path>` / `--pg-bouncer-config-file <path>` — JSON files with initial runtime config

**Omitting `--ip-allow` allows all addresses on 5432 and 6432.** For production, pass `--ip-allow` rules instead; once any rule is given, only the listed rules apply, so add one for each port the application uses.

The size is validated server-side; if the user is unsure what sizes or regions are available, check the ClickHouse Cloud console or docs rather than guessing.

**The `create` output contains the password and connection string, and they are returned only once.** Save them to `.env` immediately (e.g. as `DATABASE_URL`) and make sure `.env` is gitignored. `get` never returns credentials; if they are lost, `reset-password` (Step 3) is the only way back.

`create` returns before the service is usable. Poll until `state` is `running` (service IDs come from `postgres list`):

```bash
clickhousectl cloud postgres list --json
clickhousectl cloud postgres get <postgres-id> --json
```

`get` shows the host and username. Connections use port 5432, database `postgres`, and TLS.

## Step 3: Connect

Fetch the CA bundle for TLS verification. Use `--output`: coding agents get JSON output automatically, so redirecting stdout would write JSON rather than PEM.

```bash
clickhousectl cloud postgres certs get <postgres-id> --output ca.pem
```

Connect with psql using the host and username from `get`, and let psql prompt for the password:

```bash
psql "host=<host> port=5432 dbname=postgres user=<username> sslmode=verify-full sslrootcert=ca.pem" \
  --command "SELECT version()"
```

If psql is not installed locally, run it from the official image instead, e.g. `docker run --rm -it -v "$PWD:/work" -w /work postgres:18 psql "<connection string>"`. (`clickhousectl local postgres client --host` does not help here: it needs psql on the PATH and does not pass a password.)

If the password from `create` was lost, set a new one:

```bash
clickhousectl cloud postgres reset-password <postgres-id> --generate
```

`--generate` prints a random compliant password once; store it in `.env` immediately. (Or pass `--password <pw>`: minimum 12 characters with upper, lower, and digit.) If you embed the password in a connection URI, percent-encode it first.

## Step 4: Apply the schema

If the user developed locally first (see [local.md](local.md)), apply the same schema files to the cloud service, e.g.:

```bash
psql "host=<host> port=5432 dbname=postgres user=<username> sslmode=verify-full sslrootcert=ca.pem" \
  --file postgres/tables/schema.sql
```

## Step 5: Runtime configuration (as needed)

```bash
clickhousectl cloud postgres config get <postgres-id> --json                       # pgConfig + pgBouncerConfig
clickhousectl cloud postgres config patch <postgres-id> --set max_connections=500  # change selected pgConfig fields
clickhousectl cloud postgres config replace <postgres-id> --file config.json       # replace entire config
```

Prefer `patch` over `replace` for targeted changes. `patch --set` only touches `pgConfig`; use `--file` with a JSON file containing both `pgConfig` and `pgBouncerConfig` objects (either may be `{}`) to change PgBouncer settings, whose values are strings. `replace` sends the whole object, so start from `config get --json` output.

Exit 0 means the change was accepted, not that it is active. Read it back with `config get`. If the response says a restart is required, run `cloud postgres restart <postgres-id>`, then reconnect and confirm with `SHOW <setting>`.

## Day-2 operations

| Task | Command |
|------|---------|
| Resize / change HA | `cloud postgres update <id> --size <size> --ha-type <type>` |
| Rename (changes the hostname) | `cloud postgres update <id> --new-name <name>` |
| Tags | `cloud postgres update <id> --add-tag key=value --remove-tag <key>` |
| Access rules | `cloud postgres update <id> --remove-ip-allow <rule-id> --add-ip-allow <IP_OR_CIDR:PORTS>` (rule IDs from `get`) |
| Create a read replica | `cloud postgres read-replica create <source-id> --name <replica-name>` |
| Promote replica to primary | `cloud postgres promote <replica-id>` |
| Planned primary/standby swap (HA) | `cloud postgres switchover <id>` |
| Point-in-time restore | `cloud postgres restore <id> --name <new-name> --restore-target 2026-04-16T12:00:00Z` |
| List backups | `cloud postgres backup list <id>` |
| Server logs | `cloud postgres logs <id> --from-date <RFC3339> --to-date <RFC3339>` |
| Metrics | `cloud postgres metrics <id> --from-date <RFC3339> --to-date <RFC3339>` |
| Slow query patterns | `cloud postgres slow-queries list <id> --from-date <RFC3339> --to-date <RFC3339>` |
| Restart | `cloud postgres restart <id>` |
| Delete | `cloud postgres delete <id>` |

Most of these also accept `--name <service-name>` in place of the ID (`backup list` and `slow-queries` take only the ID).

- `restore` creates a **new** service from the source's backups at the given RFC 3339 timestamp, which must be inside the backup retention window; it does not modify the source. It copies the source's current IPv4 access rules unless `--ip-allow` or `--block-public-access` is given.
- `restore` and `read-replica create` return no password, and the source's password may not work on the new service. Wait for `running`, then use `reset-password` if no valid password is known.
- `promote`, `switchover`, and `restart` return when the request is accepted, not when it completes. After `promote`, poll `get <replica-id> --json` until `isPrimary` is `true`. To confirm a restart, compare `SELECT pg_postmaster_start_time()` before and after.
- `delete`, `promote`, and `switchover` are disruptive, and `delete` is irreversible and runs with no confirmation prompt, from any state. Confirm with the user before running them, and never run `delete` unless the user explicitly asked to delete that specific service.

For performance investigations on a managed Postgres service, use the `clickhouse-managed-postgres-rca` skill if it is available.
