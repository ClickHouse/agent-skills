---
name: infra-clickhouse
description: Set up or operate a local ClickHouse server or ClickHouse Cloud service with clickhousectl, including connections and requested schema migrations.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.4.0"
---

# ClickHouse with clickhousectl

`clickhousectl` manages ClickHouse in two environments:

- **Local** — ClickHouse installed and running on the user's machine, for development.
- **Cloud** — managed ClickHouse Cloud services, for production: fully managed, automatic scaling, backups, and upgrades.

This file routes to the right reference. The step-by-step workflows live in `ref/local.md` and `ref/cloud.md` — read the one that matches the user's situation before running commands.

## Which reference to use

| The user wants to... | Read |
|----------------------|------|
| Set up or operate a local ClickHouse development server | [ref/local.md](ref/local.md) |
| Provision or deploy to ClickHouse Cloud | [ref/cloud.md](ref/cloud.md) |
| Operate an existing cloud service (schemas, users, queries against it) | [ref/cloud.md](ref/cloud.md) |
| Develop locally now, ship to production later | Start with [ref/local.md](ref/local.md); it points to [ref/cloud.md](ref/cloud.md) when it's time to go to prod |

Use existing endpoints, project configuration and authorization first. A coding or SQL question does not require installing a CLI or provisioning a database. For new development setup with no target, default to local; production alone does not imply moving an existing deployment to ClickHouse Cloud. Cloud creation must be within the user's requested scope, with the target organization, region and sizing resolved before execution. Do not reconfirm choices already supplied.

Read only the relevant part of the selected reference. Preserve existing servers, versions, credentials and schemas; skip completed setup steps. Check the installed CLI's relevant `--help` when syntax or behavior differs from the examples.

## Prerequisites (both workflows)

Check that `clickhousectl` is installed:

```bash
which clickhousectl
```

If missing and CLI installation is needed for the requested work, install it under the host tool's permission policy:

```bash
curl -fsSL https://clickhouse.com/cli | sh
```

This installs to `~/.local/bin/clickhousectl` (with a `chctl` alias). If the command is still not found, suggest `export PATH="$HOME/.local/bin:$PATH"` or a new terminal.

Use `--json` where the subcommand supports it. Inspect exit status and errors before retrying; a timeout during creation is not proof that no resource was created.

## Related

- When designing schemas, consult the `clickhouse-best-practices` skill for ORDER BY selection, data types, and partitioning.
- For Postgres (local development or managed ClickHouse Cloud Postgres), use the `infra-postgres` skill.
