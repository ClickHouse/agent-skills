# Local ClickHouse for development

Setting up a complete local ClickHouse development environment with `clickhousectl`. For a fresh setup, use the steps below. For an existing project, perform only the requested operation and its missing prerequisites.

## Step 1: Install ClickHouse and set the default

Check the existing local servers and project version first. Reuse a suitable server and pinned version. For a new installation without a version requirement, the following selects the current stable channel:

```bash
clickhousectl local use stable
```

This installs ClickHouse, sets it as the default version used by `clickhousectl local` commands, and symlinks `~/.local/bin/clickhouse` to the binary, putting `clickhouse` on your PATH (meaning you can invoke `clickhouse` directly, e.g. `clickhouse client` if needed).

Use a supported exact version specifier when matching production or a project pin. `local use` changes the CLI default and the user-level symlink; do not run it for an unrelated SQL/code task or silently replace a required version.

## Step 2: Initialize the project

From the user's project root directory:

```bash
clickhousectl local init
```

This creates a standard folder structure:

```
clickhouse/
  tables/                 # CREATE TABLE statements
  materialized_views/     # Materialized view definitions
  queries/                # Saved queries
  seed/                   # Seed data / INSERT statements
```

**Note:** This step is optional. If the user already has their own folder structure for SQL files, skip this and adapt the later steps to use their paths.

## Step 3: Start a local server

```bash
clickhousectl local server start --name <name>
```

This starts a ClickHouse server in the background. Inspect `local server list` before creating another server; reuse the requested instance and check port conflicts.

**To check running servers and see their exposed ports:**

```bash
clickhousectl local server list
```

## Step 4: Create the schema

Based on the user's application requirements, write CREATE TABLE SQL files.

Follow the project's migration layout. For a new project, one table definition per file in `clickhouse/tables/` is a useful convention:

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

Compare with existing DDL before applying a requested migration; `IF NOT EXISTS` does not update a different existing definition. Apply to the identified server:

```bash
clickhousectl local client --name <name> --queries-file clickhouse/tables/events.sql
```

## Step 5: Seed data (optional)

If the user needs sample data for development, use a disposable development table and avoid duplicating prior seed rows on retry. Write INSERT statements to `clickhouse/seed/`:

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
clickhousectl local client --name <name> --queries-file clickhouse/seed/events.sql
```

## Step 6: Verify the setup

Verify the part of the setup changed by this task. For the example schema, confirm tables were created:

```bash
clickhousectl local client --name <name> --query "SHOW TABLES"
```

Run a test query:

```bash
clickhousectl local client --name <name> --query "SELECT count() FROM events"
```

## Going to production

When the user is ready to move from local development to a managed ClickHouse Cloud service, read [cloud.md](cloud.md) — it covers authentication, creating the service, migrating the local schema, and connecting the application.
