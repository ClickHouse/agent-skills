# Migrate an existing Postgres to ClickHouse Cloud Postgres

Move a database from another Postgres provider (Neon, Supabase, RDS, Aurora, Cloud SQL, self-hosted, ...) into a ClickHouse Cloud Postgres service with `pg_dump` and `pg_restore`.

**Do not use ClickPipes for this.** `clickhousectl cloud clickpipe create postgres` replicates Postgres into a *ClickHouse* service for analytics; it cannot target a Postgres service.

`pg_dump`/`pg_restore` is a one-shot copy: writes that land on the source after the dump starts are not migrated. Confirm with the user that writes can be paused for the duration of the dump and restore (or that the source is not yet in production) before starting.

## Step 1: Inspect the source

Get a **direct** (non-pooled) connection string for the source. Transaction-mode poolers (PgBouncer, Supavisor) can break `pg_dump`.

- Neon: `neonctl connection-string <branch> --project-id <project-id> --database-name <db>` (non-pooled by default; the pooled host contains `-pooler`)
- Supabase: the "Direct connection" string, not the pooler
- Others: the provider's primary endpoint

Store it in `.env` as `SOURCE_URL`, then record what you are moving:

```bash
psql "$SOURCE_URL" -c "SHOW server_version;"
psql "$SOURCE_URL" -c "SELECT pg_size_pretty(pg_database_size(current_database()));"
psql "$SOURCE_URL" -c "SELECT extname, extversion FROM pg_extension ORDER BY 1;"
psql "$SOURCE_URL" -c "\dn"
```

## Step 2: Create the target

Follow [cloud.md](cloud.md) Steps 1–3 to authenticate and create a service, with two migration-specific choices:

- `--pg-version` must be the **same or newer** major version than the source.
- Pick the region closest to the source to keep dump/restore time down.

`create` returns the password and connection string **once** — write the connection string to `.env` immediately as `TARGET_URL`. It connects as `postgres` to the `postgres` database with `sslmode=require`. Wait until `cloud postgres get <id>` reports `state=running`.

Check that every extension from Step 1 is available on the target:

```bash
psql "$TARGET_URL" -c "SELECT name, default_version FROM pg_available_extensions WHERE name IN ('<ext1>', '<ext2>');"
```

Provider-specific extensions won't exist on the target; exclude them in Step 4. If an extension the application uses is missing, stop and tell the user before continuing.

## Step 3: Check client versions

`pg_dump` must be the **same or newer** major version than the source server:

```bash
pg_dump --version
pg_restore --version
```

If the local client is older, run the tools from the official image instead, e.g. `docker run --rm -v "$PWD:/work" -w /work postgres:18 pg_dump ...`.

## Step 4: Dump the source

```bash
pg_dump "$SOURCE_URL" \
  --format directory \
  --jobs 4 \
  --no-owner \
  --no-privileges \
  --file dump
```

- `--format directory` + `--jobs` dumps tables in parallel; `dump/` must not already exist.
- `--no-owner --no-privileges` — the source's roles (e.g. `neon_superuser`, Supabase's `authenticated`) don't exist on the target, so ownership and grants are dropped; everything is owned by the restoring user.
- Exclude provider-managed objects that only work on the source platform:
  - `--exclude-schema neon_auth` on Neon, if the project has Neon Auth enabled
  - `--exclude-extension <name>` (pg_dump 17+) for each provider-specific extension found in Step 2

## Step 5: Restore into the target

Create a database with the same name as the source, then restore into it. Build `TARGET_DB_URL` by swapping only the database path segment — the username is also `postgres`, so a plain `/postgres` substitution corrupts the URL:

```bash
psql "$TARGET_URL" -c "CREATE DATABASE <db>;"
TARGET_DB_URL=$(sed -E 's#(:[0-9]+)/postgres([?]|$)#\1/<db>\2#' <<<"$TARGET_URL")

pg_restore \
  --dbname "$TARGET_DB_URL" \
  --jobs 4 \
  --no-owner \
  --no-privileges \
  dump
```

`pg_restore` keeps going on errors and prints `errors ignored on restore: N` at the end. Any non-zero count must be explained to the user before continuing. Then refresh planner statistics, which are not carried over:

```bash
psql "$TARGET_DB_URL" -c "ANALYZE;"
```

## Step 6: Validate

Compare exact row counts for every table on both sides. Run this against the source and the target database and diff the output:

```sql
SELECT table_schema, table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text::bigint AS row_count
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1, 2;
```

Schemas excluded in Step 4 (e.g. `neon_auth`) appear only on the source side of the diff; every other row must match.

Also compare `\di` (indexes), `\dv` (views), and `\ds` (sequences) — `pg_dump` sets sequence values, so the next `nextval()` on the target should continue from the source.

## Step 7: Cut over

1. Recreate application roles on the target (`CREATE ROLE ... LOGIN PASSWORD ...` plus grants) — `pg_dump` doesn't migrate roles.
2. Point the application's `DATABASE_URL` at the target and restart it.
3. Leave the source running until the user confirms the application is healthy. Never delete the source database or project unless the user explicitly asks.

## What is not migrated

Roles and role memberships, grants (dropped by `--no-owner --no-privileges`), replication slots and publications, server configuration, and planner statistics. Apply runtime settings with `clickhousectl cloud postgres config patch` (see [cloud.md](cloud.md)).
