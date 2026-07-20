# infra-clickhouse — maintainer guide

A workflow skill covering ClickHouse via `clickhousectl`, in the normalized infra-skill format (shared with `infra-postgres`):

```
SKILL.md        # decision tree: local vs cloud, shared prerequisites
ref/local.md    # local ClickHouse development (clickhousectl local ...)
ref/cloud.md    # ClickHouse Cloud deployment (clickhousectl cloud ...)
```

`SKILL.md` stays thin — it routes to the right ref. `ref/local.md` ends with a "going to production" pointer to `ref/cloud.md`.

This skill merges and supersedes the former `clickhousectl-local-dev` and `clickhousectl-cloud-deploy` skills.

## Maintenance

The content mirrors the `clickhousectl` CLI surface. When the CLI changes, re-verify against the built-in help:

```bash
clickhousectl local --help
clickhousectl cloud --help
```

and each subcommand's `--help` (the `CONTEXT FOR AGENTS` sections in the help output are the source of truth).

Bump `version` in both the SKILL.md frontmatter and `metadata.json` when editing, and keep the SKILL.md frontmatter description emphasizing **both** the local and cloud cases — it is what triggers skill activation.
