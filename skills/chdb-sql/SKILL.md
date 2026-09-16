---
name: chdb-sql
description: Run embedded ClickHouse SQL in Python with chDB. Use for chdb.query(), sessions, DB-API connections, or a requested chDB analysis of files and remote sources.
license: Apache-2.0
compatibility: Requires Python 3.9+, macOS or Linux. pip install chdb.
metadata:
  author: chdb-io
  version: "4.1.1"
  homepage: https://clickhouse.com/docs/chdb
---

# chDB SQL

Use chDB for in-process ClickHouse SQL when the task or project calls for it. A generic SQL, CSV, or Parquet question does not itself require migrating to chDB or installing it.

## Choose the API

- `chdb.query()` for an independent query.
- `Session` for queries sharing tables or persistent state; use an intentional storage path and close the session when finished.
- DB-API connections for integrations expecting a cursor/connection interface.
- DataStore for an existing pandas-style workflow; it is a separate API, not a required step before SQL.

Check the project's installed chDB version and dependency conventions. Use typed query parameters for values rather than interpolating user input. Bound exploratory output and consider remote scan volume; embedded execution does not make remote queries free. Reuse authorized data sources and credentials, and preserve requested output semantics.

## References by task

- [Independent local-file queries](references/local-query.md): `chdb.query()` signature, result access, typed parameters, output formats, and the local `file` reader.
- [API reference](references/api-reference.md): sessions, DB-API connections, streaming, callbacks, UDFs, and other advanced APIs.
- [Quick-start patterns](references/quick-start.md): stateful Session and DB-API examples.
- [Table functions](references/table-functions.md): remote sources, databases, data lakes, Python data, and utility readers.
- [SQL functions](references/sql-functions.md): common analytical functions.
- [Examples](examples/examples.md): fuller query and pipeline examples.
- [Environment check](scripts/verify_install.py): optional local smoke check for installation/API problems; run from this skill directory.
- [Official documentation](https://clickhouse.com/docs/chdb): verify version-sensitive behavior.

Read the references that answer the task. Configuration or credentials needed only by a different API are not prerequisites.
