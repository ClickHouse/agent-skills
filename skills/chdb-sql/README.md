# chdb SQL

Agent skill for using chdb's SQL API — run ClickHouse SQL directly in Python without a server.

## Installation

```bash
npx skills add clickhouse/agent-skills
```

## What's Included

| File | Purpose |
|------|---------|
| `SKILL.md` | Skill definition with quick-start examples |
| `references/quick-start.md` | Examples by API |
| `references/local-query.md` | Independent local-file queries, parameters, outputs and result access |
| `references/api-reference.md` | Session, Connection and advanced APIs; links to independent queries |
| `references/table-functions.md` | Common source table functions (file, s3, mysql, etc.) |
| `references/sql-functions.md` | Commonly used ClickHouse SQL functions |
| `examples/examples.md` | 9 runnable examples with expected output |
| `scripts/verify_install.py` | Environment verification script |

## Trigger Phrases

This skill activates when you:
- "Query this Parquet/CSV file with chDB SQL"
- "Use chdb to run a query"
- "Join MySQL and S3 data with chDB SQL"
- "Create a chDB session"
- "Use a table function in chDB"
- "Write a parametrized chDB query"

## Related

- **chdb-datastore** — For pandas-style DataFrame operations, use the `chdb-datastore` skill instead
- **clickhouse-best-practices** — For ClickHouse schema/query optimization

## Documentation

- [chdb docs](https://clickhouse.com/docs/chdb)
- [chdb GitHub](https://github.com/chdb-io/chdb)
