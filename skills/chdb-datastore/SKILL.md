---
name: chdb-datastore
description: Use chDB DataStore for pandas-style analysis and cross-source DataFrame queries in Python. Applies when the project uses DataStore or the user wants to evaluate it for a pandas workload.
license: Apache-2.0
compatibility: Requires Python 3.9+, macOS or Linux. pip install chdb.
metadata:
  author: chdb-io
  version: "4.1.1"
  homepage: https://clickhouse.com/docs/chdb
---

# chDB DataStore

DataStore provides a lazy, ClickHouse-backed pandas-compatible API. Use it within the user's chosen stack; mentioning pandas, CSV, or Parquet alone is not a request to replace an existing library.

## Working with DataStore

- Inspect the installed version and existing imports before changing dependencies. If installation is needed, use the project's Python environment and dependency conventions.
- For migration, compare representative results before replacing pandas calls. Check index alignment, ordering, nulls, dtypes, joins, and operations that fall back to pandas. Compatibility and speed depend on the workload.
- Lazy execution means displaying or iterating a result can execute work. Use `.to_sql()` to inspect supported plans and bounded previews when exploring large or remote sources.
- Use only the data sources needed for the task and existing authorized credentials. Example writes and cross-source joins do not authorize exports or changes to remote databases.

## References by task

- [Quick-start patterns](references/quick-start.md): file/database readers, DataFrame operations, joins, and writing results.
- [API reference](references/api-reference.md): method signatures, execution, and backend configuration.
- [Connectors](references/connectors.md): source-specific parameters and URI forms.
- [Examples](examples/examples.md): complete analytical patterns to adapt to the actual schema.
- [Environment check](scripts/verify_install.py): optional local smoke check when diagnosing installation or API availability; run from this skill directory.
- [Official documentation](https://clickhouse.com/docs/chdb): verify APIs that depend on the installed version.

Use the SQL API references in `chdb-sql` when the task is already expressed as chDB SQL; loading both skills is not a prerequisite for DataStore work.
