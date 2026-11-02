# Local ClickHouse for development

Setting up a complete local ClickHouse development environment with `clickhousectl`. Follow these steps in order.

## Step 1: Install ClickHouse and set the default

Install the latest ClickHouse version and set it as the system default:

```bash
clickhousectl local use latest
```

This installs ClickHouse, sets it as the default version used by `clickhousectl local` commands, and symlinks `~/.local/bin/clickhouse` to the binary, putting `clickhouse` on your PATH (meaning you can invoke `clickhouse` directly, e.g. `clickhouse client` if needed).

You can use other version specifiers like `lts`, `26.4`, `26.4.2.10` when needed.

## Step 2: Initialize the project

From the user's project root directory:

```bash
clickhousectl local init
```

This creates a standard folder structure (it also creates `postgres/` for the `infra-postgres` skill, and a git-ignored `.clickhouse/` for runtime data):

```
clickhouse/
  tables/                 # CREATE TABLE statements
  materialized_views/     # Materialized view definitions
  queries/                # Saved queries
  seed/                   # Seed data / INSERT statements
  udfs/                   # Executable UDFs
```

It is idempotent — re-running only creates what is missing. Project commands use `.clickhouse/` in the exact current directory, so run every `clickhousectl local` command from the project root.

**Note:** This step is optional. If the user already has their own folder structure for SQL files, skip this and adapt the later steps to use their paths.

## Step 3: Start a local server

```bash
clickhousectl local server start <name>
```

This starts a ClickHouse server in the background and waits up to 30 seconds for it to accept connections. The name is optional: without one it is `default`, or a generated name if `default` is already running — keep the name it prints for later commands. HTTP and TCP ports default to 8123 and 9000, or free ports if those are taken.

**To check running servers and see their exposed ports:**

```bash
clickhousectl local server list
```

## Step 4: Create the schema

Based on the user's application requirements, write CREATE TABLE SQL files.

**Write each table definition to its own file** in `clickhouse/tables/`:

```bash
# Example: clickhouse/tables/events.sql
```

```sql
CREATE TABLE IF NOT EXISTS events (
    timestamp DateTime,
    user_id UInt32,
    event_type LowCardinality(String),
    properties String
)
ENGINE = MergeTree()
ORDER BY (event_type, timestamp)
```

When designing schemas, if the `clickhouse-best-practices` skill is available, consult it for guidance on ORDER BY column selection, data types, and partitioning.

**Apply the schema to the running server:**

```bash
clickhousectl local client <name> --queries-file clickhouse/tables/events.sql
```

## Step 5: Seed data (optional)

If the user needs sample data for development, write INSERT statements to `clickhouse/seed/`:

```bash
# Example: clickhouse/seed/events.sql
```

```sql
INSERT INTO events (timestamp, user_id, event_type, properties) VALUES
    ('2024-01-01 00:00:00', 1, 'page_view', '{"page": "/home"}'),
    ('2024-01-01 00:01:00', 2, 'click', '{"button": "signup"}');
```

**Apply seed data:**

```bash
clickhousectl local client <name> --queries-file clickhouse/seed/events.sql
```

## Step 6: Verify the setup

Confirm tables were created:

```bash
clickhousectl local client <name> --query "SHOW TABLES"
```

Run a test query:

```bash
clickhousectl local client <name> --query "SELECT count() FROM events"
```

Output is clickhouse-client's native format. To choose one, pass it after `--`, e.g. `clickhousectl local client <name> --query "SELECT * FROM events" -- --format JSONEachRow`.

## Step 7: Wire up the application

Write the server's connection details to `.env` (or `.env.local` with `--local`):

```bash
clickhousectl local server dotenv <name>
```

This writes `CLICKHOUSE_HOST`, `CLICKHOUSE_PORT`, and `CLICKHOUSE_HTTP_PORT` from the running server's actual ports, replacing those keys in place. Add `--user`, `--password`, or `--database` to also write `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, or `CLICKHOUSE_DATABASE`. Make sure the file is gitignored, then have the application read these variables.

## Managing local servers

```bash
clickhousectl local server list          # all servers in this project, with their ports
clickhousectl local server stop <name>
clickhousectl local server stop-all      # stops ClickHouse and Postgres servers in this project
clickhousectl local server remove <name> # stopped servers only; deletes the server's data
```

`stop` keeps data for a later `start`; `remove` is irreversible — confirm with the user before removing a server that may hold data they care about.

## Going to production

When the user is ready to move from local development to a managed ClickHouse Cloud service, read [cloud.md](cloud.md) — it covers authentication, creating the service, migrating the local schema, and connecting the application.
