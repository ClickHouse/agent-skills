# Local Postgres for development

Local Postgres instances are Docker containers managed by `clickhousectl`. Follow these steps in order.

**Docker must be installed and running** — verify first:

```bash
docker info >/dev/null 2>&1 && echo ok || echo "Docker is not running"
```

If Docker is not running, ask the user to start Docker Desktop (or the Docker daemon) before continuing.

## Step 1: Start a Postgres instance

```bash
clickhousectl local postgres start --json
```

Defaults: name `default`, Postgres 18, port 5432, user `postgres`, database `postgres`, and a random 24-character password. The image is pulled automatically if missing. If port 5432 is taken, a free port is auto-assigned — **always read the actual port and password from the JSON output** rather than assuming defaults:

```json
{
  "name": "default",
  "port": 5433,
  "user": "postgres",
  "password": "n2efVm0c4nL5dstCyIFxqTSa",
  "database": "postgres"
}
```

Useful options:
- `--name <name>` — named instances let you run several side by side (if `default` is already running and no name is given, a random name is generated)
- `-v, --version <tag>` — Postgres image tag: `17` or `18` (e.g. `17`, `17-alpine`, `18.1`). Default: 18
- `--port`, `--user`, `--password`, `--database` — override defaults
- `-e KEY=VALUE` — extra container env vars (repeatable)

Data persists across restarts at `.clickhouse/servers/<name>-pg<major>/data/` in the project directory. Instances are per-project (keyed on the working directory).

## Step 2: Run SQL

`clickhousectl local postgres client` wraps psql — it looks up the port and credentials of a named instance automatically. If `psql` is not on the host PATH, it runs psql inside the container instead, so no local Postgres install is required.

Single query:

```bash
clickhousectl local postgres client --name default --query "SELECT version()"
```

Apply a SQL file (e.g. schema or seed data):

```bash
clickhousectl local postgres client --name default --queries-file schema.sql
```

Interactive psql session (only when the user asks for one — it blocks the terminal):

```bash
clickhousectl local postgres client --name default
```

Extra psql arguments pass through after `--`.

## Step 3: Wire up the application

Write connection env vars to `.env` (or `.env.local` with `--local`):

```bash
clickhousectl local postgres dotenv --name default
```

This writes `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DATABASE`, replacing any existing `POSTGRES_*` vars in place. Make sure `.env` is gitignored, then have the application read these variables (or compose them into a `postgres://` connection string).

## Managing local instances

```bash
clickhousectl local server list          # lists ClickHouse and Postgres instances together
clickhousectl local postgres stop <name>
clickhousectl local postgres stop-all
clickhousectl local postgres remove <name>   # deletes the data directory too
```

`stop` keeps data for a later `start`; `remove` is destructive — confirm with the user before removing an instance that may hold data they care about. Use `-v <version>` with `stop`/`remove` to disambiguate when two instances share a name.

## Going to production

When the user is ready to move from local development to a managed Postgres service in ClickHouse Cloud, read [cloud.md](cloud.md) — it covers authentication, creating the service, connecting with TLS, and applying the same schema there.
