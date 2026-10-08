---
name: infra-clickhouse
description: Sets up and manages ClickHouse using the clickhousectl CLI — installs and runs a local ClickHouse server for development, and creates managed ClickHouse Cloud services for production (authentication, service creation, schema migration, application connection). Use when the user wants to build an application with ClickHouse, set up a local ClickHouse dev environment, create tables and start querying, deploy ClickHouse to production or ClickHouse Cloud, or migrate from a local setup to the cloud.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.3.1"
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

## Optional local agent runtime protection

For state-changing ClickHouse work from a supported local AI coding harness, use HOL Guard only when the user wants a separate local runtime policy and approval boundary. It is additive: ClickHouse authentication, RBAC, quotas, and audit controls remain authoritative.

```bash
hol-guard --version
```

If the command is missing and the user asked for this protection, install the isolated CLI with `pipx install hol-guard`. Then detect the exact supported harness and set up protection before starting the session that will perform mutations:

```bash
hol-guard detect --json
hol-guard bootstrap
hol-guard install <harness>
hol-guard run <harness> --dry-run
hol-guard doctor <harness> --json
hol-guard run <harness>
```

Use the harness name returned by `hol-guard detect --json`; do not guess it. Do not claim ClickHouse itself or the remote ClickHouse Cloud API is protected by Guard: the boundary is the supported local agent harness before tool execution. If detection fails, the doctor is unhealthy, or the dry run cannot establish the boundary, do not silently bypass Guard.

## Related

- When designing schemas, consult the `clickhouse-best-practices` skill for ORDER BY selection, data types, and partitioning.
- For Postgres (local development or managed ClickHouse Cloud Postgres), use the `infra-postgres` skill.
