---
title: Choose Output Format Based on Use Case
impact: HIGH
impactDescription: "Wrong format wastes tokens and makes results harder for agents to parse"
tags: [agent, format, output, performance]
---

## Choose Output Format Based on Use Case

**Impact: HIGH**

Agents should select the output format based on what they need from the result. The wrong format wastes context window tokens and makes parsing unreliable.

**Format comparison:**

| Format | Structure | Metadata | Best For |
|--------|-----------|----------|----------|
| `JSON` | `{ meta, data, rows, statistics }` | Column names, types, row count, elapsed time, rows/bytes read | General agent work — single queries where the agent needs types and statistics |
| `JSONEachRow` | One JSON object per line | None | Large result sets, streaming, piping through `jq` |
| `JSONCompact` | `{ meta, data (arrays), rows, statistics }` | Same as JSON | When you already know the schema and want smaller payloads |
| `TabSeparatedWithNames` | Header row + TSV rows | Column names only | Minimal token usage for simple tabular data |
| `Pretty` | Formatted ASCII table | Visual only | Human display only — never for agent parsing |

**Incorrect (default format, agent can't parse):**

```sql
-- No FORMAT specified — returns TabSeparated without headers
SELECT name, total_rows FROM system.tables WHERE database = 'default'
```

**Correct (explicit format for the use case):**

```sql
-- Agent needs column types and statistics
SELECT name, total_rows FROM system.tables
WHERE database = 'default'
FORMAT JSON

-- Agent processing large export, one row at a time
SELECT * FROM events WHERE event_date = today()
FORMAT JSONEachRow

-- Agent needs compact output to stay within context limits
SELECT name, total_rows FROM system.tables
WHERE database = 'default'
FORMAT TabSeparatedWithNames
```

**Token efficiency matters:**

A 1000-row result in `JSON` can be 5-10x more tokens than `TabSeparatedWithNames`. When result sets are large, using a compact format keeps the agent within context limits and reduces cost.

| 1000 Rows, 5 Columns | Approximate Tokens |
|-----------------------|-------------------|
| `JSON` | ~15,000-25,000 |
| `JSONEachRow` | ~12,000-20,000 |
| `JSONCompact` | ~8,000-12,000 |
| `TabSeparatedWithNames` | ~3,000-5,000 |

**Decision guide:**

| Agent Needs | Use Format |
|-------------|-----------|
| Column types to build follow-up queries | `JSON` |
| Row count and query statistics | `JSON` |
| Stream rows through a processing pipeline | `JSONEachRow` |
| Minimal tokens, simple structure | `TabSeparatedWithNames` |
| Values might contain tabs or newlines | `CSVWithNames` |
| Human-readable debugging | `Pretty` |

Always include `FORMAT <format>` at the end of the query, not as a setting or URL parameter (those work but are less explicit and harder to audit).

Reference: [Output Formats](https://clickhouse.com/docs/interfaces/formats)
