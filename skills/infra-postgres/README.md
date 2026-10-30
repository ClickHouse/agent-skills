# infra-postgres — maintainer guide

A workflow skill covering Postgres via `clickhousectl`, in the normalized infra-skill format (shared with `infra-clickhouse`):

```
SKILL.md        # decision tree: local vs cloud, shared prerequisites
ref/local.md    # local Docker-backed Postgres (clickhousectl local postgres ...)
ref/cloud.md    # ClickHouse Cloud Postgres, beta (clickhousectl cloud postgres ...)
ref/migrate.md  # migrate an existing Postgres into ClickHouse Cloud Postgres (pg_dump/pg_restore)
```

`SKILL.md` stays thin — it routes to the right ref. `ref/local.md` ends with a "going to production" pointer to `ref/cloud.md`.

## Maintenance

The content mirrors the `clickhousectl` CLI surface. When the CLI changes, re-verify against the built-in help:

```bash
clickhousectl local postgres --help
clickhousectl cloud postgres --help
```

and each subcommand's `--help` (the `CONTEXT FOR AGENTS` sections in the help output are the source of truth for behavior like port auto-assignment, password generation, and data directory layout).

Command output examples were captured from real runs — if flags or JSON shapes change, update the examples rather than deleting them.

Bump `version` in the SKILL.md frontmatter, `metadata.json` and `.claude-plugin/marketplace.json` when editing. Also update the version header at the top of the SKILL.md body (date and clickhousectl version) and the matching `clickhousectl-version` frontmatter entry to the clickhousectl release you verified against; see "Skills That Use clickhousectl" in the root `AGENTS.md`. Keep the SKILL.md frontmatter description emphasizing **both** the local and cloud cases — it is what triggers skill activation.
