# ClickHouse Cloud Postgres (beta)

Managed Postgres services in ClickHouse Cloud, controlled with `clickhousectl cloud postgres`. Follow these steps in order; the day-2 operations table at the end covers ongoing management.

## Step 1: Authenticate

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

`--name`, `--region`, and `--size` are required:

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

Then poll until the service is running (service IDs come from `postgres list`):

```bash
clickhousectl cloud postgres list --json
clickhousectl cloud postgres get <postgres-id> --json
```

The `get` output includes the connection endpoint details.

## Step 3: Connect

Set a known password (ClickHouse cannot reveal the current one):

```bash
clickhousectl cloud postgres reset-password <postgres-id> --generate
```

`--generate` prints a random compliant password; store it in `.env` immediately. (Or pass `--password <pw>`: minimum 12 characters with upper, lower, and digit.)

For TLS verification, fetch the CA bundle:

```bash
clickhousectl cloud postgres certs get <postgres-id> > ca.pem
```

Connect with psql using the endpoint from `postgres get`. If psql is not installed locally, reuse the local wrapper's explicit-host mode (runs psql via Docker if needed):

```bash
clickhousectl local postgres client --host <endpoint-host> --port <port> -- -U <user> -d <database>
```

## Step 4: Apply the schema

If the user developed locally first (see [local.md](local.md)), apply the same schema files to the cloud service, e.g.:

```bash
clickhousectl local postgres client --host <endpoint-host> --port <port> \
  -- -U <user> -d <database> -f schema.sql
```

## Step 5: Runtime configuration (as needed)

```bash
clickhousectl cloud postgres config get <postgres-id>          # pgConfig + pgBouncerConfig
clickhousectl cloud postgres config patch <postgres-id> ...    # change selected fields
clickhousectl cloud postgres config replace <postgres-id> ...  # replace entire config
```

Prefer `patch` over `replace` for targeted changes. Check `--help` on each subcommand for the exact flags.

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

`restore` creates a **new** service from the source's backups at the given RFC 3339 timestamp; it does not modify the source. `delete`, `promote`, and `switchover` are disruptive — confirm with the user before running them, and never run `delete` unless the user explicitly asked to delete that specific service.
