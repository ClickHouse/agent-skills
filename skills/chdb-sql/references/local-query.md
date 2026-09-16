# Independent local-file queries

Use this reference for a standalone `chdb.query()` over local files. Stateful tables, DB-API integrations, remote sources, and advanced APIs have separate references in `SKILL.md`.

## chdb.query()

```python
chdb.query(sql, output_format="CSV", path="", udf_path="", params=None)
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sql` | str | _(required)_ | ClickHouse SQL query |
| `output_format` | str | `"CSV"` | Output format (see [Output Formats](#output-formats)) |
| `path` | str | `""` | Database path (empty = in-memory, no state) |
| `udf_path` | str | `""` | Path for UDF scripts |
| `params` | dict | `None` | Named parameters (see [Parametrized Queries](#parametrized-queries)) |

**Returns:** Result object with:

| Property/Method | Description |
|-----------------|-------------|
| `.show()` | Print result to stdout |
| `.bytes()` | Raw bytes of the result |
| `.data()` | Result as string |
| `.rows_read` | Number of rows read |
| `.bytes_read` | Number of bytes read |
| `.elapsed` | Query execution time in seconds |

```python
import chdb

result = chdb.query("SELECT 1 + 1 AS answer")
result.show()       # prints: 2
print(result.data())  # "2\n"

df = chdb.query("SELECT * FROM numbers(10)", "DataFrame")
print(df)  # pandas DataFrame
```

---

## File Sources

### file()

Query local files. Format is auto-detected from extension or specified explicitly.

```sql
SELECT * FROM file('data.parquet', Parquet)
SELECT * FROM file('data.csv', CSVWithNames)
SELECT * FROM file('events.jsonl', JSONEachRow)
SELECT * FROM file('logs/*.parquet', Parquet)              -- glob pattern
SELECT * FROM file('data/2024-*/events.csv', CSVWithNames) -- nested glob
```

**Parameters:** `file(path [, format [, structure [, compression]]])`

Supported formats: `Parquet`, `CSVWithNames`, `CSV`, `TSVWithNames`, `JSONEachRow`, `JSON`, `Arrow`, `ORC`, `Avro`, `XMLWithNames`.

Supported compression: auto-detected from extension (`.gz`, `.zst`, `.bz2`, `.xz`, `.lz4`).

---

## Output Formats

| Format | Description | Use case |
|--------|-------------|----------|
| `"CSV"` | Comma-separated (default) | General export |
| `"CSVWithNames"` | CSV with header row | Spreadsheet import |
| `"JSON"` | JSON object with metadata | API responses |
| `"JSONEachRow"` | One JSON object per line | Streaming / NDJSON |
| `"DataFrame"` | pandas DataFrame | Python analysis |
| `"Arrow"` | Apache Arrow bytes | IPC format |
| `"ArrowTable"` | pyarrow.Table | Arrow ecosystem |
| `"Parquet"` | Parquet bytes | File export |
| `"Pretty"` | Formatted table | Terminal display |
| `"PrettyCompact"` | Compact table | Terminal display |
| `"TabSeparated"` | TSV | Tab-delimited export |
| `"Debug"` | Debug info | Troubleshooting |

```python
import chdb

chdb.query("SELECT 1", "Pretty").show()            # formatted table
df = chdb.query("SELECT * FROM numbers(5)", "DataFrame")  # pandas DataFrame
arrow = chdb.query("SELECT 1", "ArrowTable")        # pyarrow Table
```

---

## Parametrized Queries

Use `{name:Type}` placeholders in SQL, and pass values via `params`:

```python
import chdb

result = chdb.query(
    """
    SELECT toDate({start:String}) + number AS date, rand() % 1000 AS value
    FROM numbers({days:UInt64})
    """,
    "DataFrame",
    params={"start": "2025-01-01", "days": 30})
print(result)
```

Supported types: `String`, `UInt8`–`UInt64`, `Int8`–`Int64`, `Float32`, `Float64`, `Date`, `DateTime`.

For common SQL functions, read [sql-functions.md](sql-functions.md). For fuller local-file pipelines, read [examples.md](../examples/examples.md). Verify version-sensitive behavior against the installed chDB version and the [official documentation](https://clickhouse.com/docs/chdb).
