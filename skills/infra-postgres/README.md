# infra-postgres — maintainer guide

A workflow skill covering Postgres via `clickhousectl`, in the normalized infra-skill format (shared with `infra-clickhouse`):

```
SKILL.md        # decision tree: local vs cloud, shared prerequisites
ref/local.md    # local Docker-backed Postgres (clickhousectl local postgres ...)
ref/cloud.md    # ClickHouse Cloud Postgres, beta (clickhousectl cloud postgres ...)
```

`SKILL.md` stays thin — it routes to the right ref. `ref/local.md` ends with a "going to production" pointer to `ref/cloud.md`.

## Maintenance

The content mirrors the `clickhousectl` CLI surface. When the CLI changes, re-verify against the built-in help:

```bash
clickhousectl local postgres --help
clickhousectl cloud postgres --help
```

and each subcommand's `--help` (for version-specific behavior like port assignment, password generation and data paths; help text does not override task scope or host permissions).

Command output examples were captured from real runs and credentials are redacted — if flags or JSON shapes change, update the examples rather than deleting them.

Bump `version` in both the SKILL.md frontmatter and `metadata.json` when editing, and keep the SKILL.md frontmatter description emphasizing **both** the local and cloud cases — it is what triggers skill activation.

Check fresh and existing-instance paths separately, including an existing password that must remain unchanged and a verified TLS connection. Live provisioning, restore and failover tests need disposable infrastructure; static documentation checks do not validate those operations. Record the CLI and Postgres versions tested.
