---
name: infra-postgres
description: Sets up and manages Postgres using the clickhousectl CLI — runs a local Docker-backed Postgres for development, and creates and operates managed ClickHouse Cloud Postgres services (connections, TLS, runtime config, read replicas, failover, point-in-time restore). Use when the user wants a Postgres or PostgreSQL database for their application, a local Postgres dev environment, psql access, or a managed/production Postgres in ClickHouse Cloud, or mentions moving a local Postgres to production.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.1.0"
---

# Postgres with clickhousectl

`clickhousectl` manages Postgres in two environments:

- **Local** — named, Docker-backed Postgres instances on the user's machine, for development.
- **Cloud** — managed Postgres services in ClickHouse Cloud (beta), for production: HA, read replicas, point-in-time restore.

This file routes to the right reference. The step-by-step workflows live in `ref/local.md` and `ref/cloud.md` — read the one that matches the user's situation before running commands.

## Which reference to use

| The user wants to... | Read |
|----------------------|------|
| Develop or prototype locally, run tests/CI against Postgres, no cloud account needed | [ref/local.md](ref/local.md) |
| Go to production, host a managed Postgres, or use ClickHouse Cloud explicitly | [ref/cloud.md](ref/cloud.md) |
| Operate an existing cloud service (passwords, TLS, config, replicas, failover, restore) | [ref/cloud.md](ref/cloud.md) |
| Develop locally now, ship to production later | Start with [ref/local.md](ref/local.md); it points to [ref/cloud.md](ref/cloud.md) when it's time to go to prod |

If it's genuinely ambiguous (e.g. "set up Postgres for my app"), default to local for development tasks and ask before creating anything in the cloud — cloud services cost money.

## Prerequisites (both workflows)

Check that `clickhousectl` is installed:

```bash
which clickhousectl
```

If not found, install it:

```bash
curl -fsSL https://clickhouse.com/cli | sh
```

This installs to `~/.local/bin/clickhousectl` (with a `chctl` alias). If the command is still not found, suggest `export PATH="$HOME/.local/bin:$PATH"` or a new terminal.

All commands accept `--json` for machine-readable output. Exit codes follow `gh` conventions: 0 success, 1 error, 2 cancelled, 4 auth required.

## Related

- To replicate Postgres data into ClickHouse for analytics, see ClickPipes (`clickhousectl cloud clickpipe --help`).
- For ClickHouse itself (local development or ClickHouse Cloud services), use the `infra-clickhouse` skill.
