# Local Postgres for development

Local Postgres instances are Docker containers managed by `clickhousectl`. For new setup, follow the applicable steps below. Reuse an existing target instance and project version instead of starting a new container for every task.

**Docker must be installed and running** — verify first:

```bash
docker info >/dev/null 2>&1 && echo ok || echo "Docker is not running"
```

If Docker is not running, ask the user to start Docker Desktop (or the Docker daemon) before continuing.

## Step 1: Start a Postgres instance

Inspect `clickhousectl local server list` first. For a new instance, use an explicit task-specific name and the project's required version. Capture generated credentials privately; do not display the raw JSON:

```bash
( umask 177
  clickhousectl local postgres start --name app-dev --json > .postgres-start.json
)
chmod 600 .postgres-start.json
```

Gitignore the private output file and `.env` before creating them. Check the command's exit status and parse the saved response locally; report only nonsecret fields. The examples below use `app-dev`; substitute the resolved instance name throughout.

Defaults: name `default`, Postgres 18, port 5432, user `postgres`, database `postgres`, and a random 24-character password. The image is pulled automatically if missing. If port 5432 is taken, a free port is auto-assigned — **always read the actual port and password from the JSON output** rather than assuming defaults:

```json
{
  "name": "app-dev",
  "port": 5433,
  "user": "postgres",
  "password": "<redacted>",
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
clickhousectl local postgres client --name app-dev --query "SELECT version()"
```

Apply a requested SQL file using the project's migration conventions, after inspecting existing schema. Seed only a development target when requested; retries must not duplicate data:

```bash
clickhousectl local postgres client --name app-dev --queries-file schema.sql
```

Interactive psql session (only when the user asks for one — it blocks the terminal):

```bash
clickhousectl local postgres client --name app-dev
```

Extra psql arguments pass through after `--`.

## Step 3: Wire up the application

Inspect existing connection configuration first. Only use this command when replacing the project's `POSTGRES_*` target is intended; otherwise merge with the selected environment/secret mechanism:

```bash
clickhousectl local postgres dotenv --name app-dev
```

This writes `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DATABASE`, replacing any existing `POSTGRES_*` vars in place. Keep the file private (`0600`) and gitignored, then have the application read these variables (or compose them into a `postgres://` connection string).

## Managing local instances

```bash
clickhousectl local server list          # lists ClickHouse and Postgres instances together
clickhousectl local postgres stop <name>
clickhousectl local postgres stop-all
clickhousectl local postgres remove <name>   # deletes the data directory too
```

`stop` keeps data for a later `start`; `remove` deletes data and must be specifically authorized for the resolved instance. Do not ask again when the user has already requested that exact deletion; do not infer it from a setup task. `stop-all` affects unrelated local instances, so prefer the named target. Use `-v <version>` with `stop`/`remove` to disambiguate when two instances share a name.

## Verify and hand off

Run a bounded connection/query check against the actual host/port and selected database. Report the instance, config location and evidence without its password. Do not treat file creation alone as a successful application connection.

## Going to production

When the user is ready to move from local development to a managed Postgres service in ClickHouse Cloud, read [cloud.md](cloud.md) — it covers authentication, creating the service, connecting with TLS, and applying the same schema there.
