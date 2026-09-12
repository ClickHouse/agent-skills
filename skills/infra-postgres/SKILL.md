---
name: infra-postgres
description: Set up or operate local Docker-backed Postgres or ClickHouse Cloud Postgres with clickhousectl, including connections, configuration, replicas and restore.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.2.0"
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
| Provision or operate Postgres in ClickHouse Cloud | [ref/cloud.md](ref/cloud.md) |
| Operate an existing ClickHouse Cloud Postgres service | [ref/cloud.md](ref/cloud.md) |
| Develop locally now, ship to production later | Start with [ref/local.md](ref/local.md); it points to [ref/cloud.md](ref/cloud.md) when it's time to go to prod |

Use existing connections, project configuration and the user's selected provider. Generic Postgres SQL, psql help or an application change does not require provisioning infrastructure or switching to ClickHouse Cloud. For a new development setup without a target, default to local. Read only the relevant operation in the selected reference.

Cloud creation, password rotation, failover and deletion must be within the user's authorized scope and target a resolved service. Reuse prior authorization; ask only when an action or consequential choice remains unspecified. Preserve existing data, credentials, configuration and version pins. Inspect the installed CLI's relevant `--help` if behavior differs from these examples.

## Prerequisites (both workflows)

Check that `clickhousectl` is installed:

```bash
which clickhousectl
```

If missing and needed for the requested work, install it under the host tool's permission policy:

```bash
curl -fsSL https://clickhouse.com/cli | sh
```

This installs to `~/.local/bin/clickhousectl` (with a `chctl` alias). If the command is still not found, suggest `export PATH="$HOME/.local/bin:$PATH"` or a new terminal.

Use `--json` where supported. Treat output containing generated passwords as secret-bearing: capture it privately and report redacted connection details. After a create timeout, inspect resource state before retrying.

## Related

- To replicate Postgres data into ClickHouse for analytics, see ClickPipes (`clickhousectl cloud clickpipe --help`).
- For ClickHouse itself (local development or ClickHouse Cloud services), use the `infra-clickhouse` skill.
