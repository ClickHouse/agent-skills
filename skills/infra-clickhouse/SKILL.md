---
name: infra-clickhouse
description: Sets up and manages ClickHouse using the clickhousectl CLI — installs and runs a local ClickHouse server for development, and creates managed ClickHouse Cloud services for production (authentication, service creation, schema migration, application connection). Use when the user wants to build an application with ClickHouse, set up a local ClickHouse dev environment, create tables and start querying, deploy ClickHouse to production or ClickHouse Cloud, or migrate from a local setup to the cloud.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.3.0"
---

# ClickHouse with clickhousectl

`clickhousectl` manages ClickHouse in two environments:

- **Local** — ClickHouse installed and running on the user's machine, for development.
- **Cloud** — managed ClickHouse Cloud services, for production: fully managed, automatic scaling, backups, and upgrades.

This file routes to the right reference. The step-by-step workflows live in `ref/local.md` and `ref/cloud.md` — read the one that matches the user's situation before running commands.

## Which reference to use

| The user wants to... | Read |
|----------------------|------|
| Build an app with ClickHouse, develop or prototype locally, no cloud account needed | [ref/local.md](ref/local.md) |
| Go to production, host a managed ClickHouse, or use ClickHouse Cloud explicitly | [ref/cloud.md](ref/cloud.md) |
| Operate an existing cloud service (schemas, users, queries against it) | [ref/cloud.md](ref/cloud.md) |
| Develop locally now, ship to production later | Start with [ref/local.md](ref/local.md); it points to [ref/cloud.md](ref/cloud.md) when it's time to go to prod |

If it's genuinely ambiguous (e.g. "set up ClickHouse for my app"), default to local for development tasks and ask before creating anything in the cloud — cloud services cost money.

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

- When designing schemas, consult the `clickhouse-best-practices` skill for ORDER BY selection, data types, and partitioning.
- For Postgres (local development or managed ClickHouse Cloud Postgres), use the `infra-postgres` skill.
