---
name: clickhouse-js-node-troubleshooting
description: >
  Troubleshoot and resolve common issues with the ClickHouse Node.js client
  (@clickhouse/client-node). Use this skill whenever a user reports errors, unexpected
  behavior, or configuration questions involving the Node.js client specifically —
  including socket hang-up errors, Keep-Alive problems, stream handling issues, data
  type mismatches, read-only user restrictions, proxy/TLS setup problems, or long-running
  query timeouts. Trigger even when the user hasn't precisely named the issue; vague
  symptoms like "my inserts keep failing" or "connection drops randomly" in a Node.js
  context are strong signals to use this skill. Do NOT use for browser/Web client issues.
---

# ClickHouse Node.js Client Troubleshooting

Reference: https://clickhouse.com/docs/integrations/javascript

> **⚠️ Node.js only.** This skill covers the `@clickhouse/client-node` package exclusively. If the user is running the ClickHouse JS client in a browser or Web Worker environment, do not use this skill — a dedicated Web client troubleshooting skill should be used instead.

---

## How to Use This Skill

When a user comes to you with a ClickHouse Node.js client issue, follow this process:

### 1. Extract context from the user's message first

Scan the user's message for any information they've already provided — client version, Node.js version, error messages, connection setup. Don't ask for information they've already given you.

### 2. Identify the issue category

Match their symptoms to one of the issues in the Issue Index below. If the issue is ambiguous, pick the most likely match and mention the alternative if relevant.

### 3. Read the reference file

Each issue has a dedicated reference file (listed below) with detailed troubleshooting steps.

### 4. Tailor your response

- **Lead with the diagnosis** — explain what's likely causing their issue and why.
- **Give the fix** — show the specific code/config change for their situation.
- **Note version constraints** — if a solution requires a minimum client version, check it against what the user told you (or flag that you need to know their version).
- **Mention next steps** — if the first fix doesn't resolve it, what should they try next?

### 5. Ask only what's missing

If you still need critical info to help (like their client version when a fix is version-dependent), ask — but keep it targeted. Don't run through a full diagnostic checklist if you already have enough to help.

---

## Issue Index

Identify the user's issue from the list below and read the corresponding reference file for detailed troubleshooting steps.

| Issue                                 | Symptoms                                                                                       | Reference file                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| **Socket Hang-Up / ECONNRESET**       | `socket hang up`, `ECONNRESET`, intermittent connection drops, long-running queries timing out | `reference/socket-hangup.md`  |
| **Data Type Mismatches**              | Large integers returned as strings, decimal precision loss, Date/DateTime insertion failures   | `reference/data-types.md`     |
| **Read-Only User Errors**             | Errors when using response compression with `readonly=1` users                                 | `reference/readonly-users.md` |
| **Proxy / Pathname URL Confusion**    | Wrong database selected, requests failing behind a proxy with a path prefix                    | `reference/proxy-pathname.md` |
| **TLS / Certificate Errors**          | TLS handshake failures, certificate verification issues, mutual TLS setup                      | `reference/tls.md`            |
| **Compression Not Working**           | GZIP compression not activating for requests or responses                                      | `reference/compression.md`    |
| **Logging Not Showing Anything**      | No log output, need custom logger integration                                                  | `reference/logging.md`        |
| **Query Parameters Not Interpolated** | Parameterized queries not working, SQL injection concerns                                      | `reference/query-params.md`   |

---

## Format Selection Quick Reference

| Use case                    | Recommended format                  | Min version                           |
| --------------------------- | ----------------------------------- | ------------------------------------- |
| Insert/select JS objects    | `JSONEachRow`                       | all                                   |
| Bulk insert arrays          | `JSONEachRow`                       | all                                   |
| Stream large result sets    | `JSONEachRow`, `JSONCompactEachRow` | all                                   |
| CSV file streaming          | `CSV`, `CSVWithNames`               | all                                   |
| Parquet file streaming      | `Parquet`                           | `>= 0.2.6`                            |
| Single JSON object response | `JSON`, `JSONCompact`               | `JSON` all; `JSONCompact` `>= 0.0.14` |
| Stream with progress        | `JSONEachRowWithProgress`           | `>= 1.7.0`                            |

> ⚠️ `JSON` and `JSONCompact` return a single object and **cannot be streamed**.

---

## Still Stuck?

- [JS client source + full examples](https://github.com/ClickHouse/clickhouse-js/tree/main/examples)
- [ClickHouse JS client docs](https://clickhouse.com/docs/integrations/javascript)
- [ClickHouse supported formats](https://clickhouse.com/docs/interfaces/formats)
