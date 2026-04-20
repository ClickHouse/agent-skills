---
name: clickhouse-js-node-troubleshooting
description: >
  Troubleshoot and resolve common issues with the ClickHouse Node.js client
  (@clickhouse/client). Use this skill whenever a user reports errors, unexpected
  behavior, or configuration questions involving the Node.js client specifically —
  including socket hang-up errors, Keep-Alive problems, stream handling issues, data
  type mismatches, read-only user restrictions, proxy/TLS setup problems, or long-running
  query timeouts. Trigger even when the user hasn't precisely named the issue; vague
  symptoms like "my inserts keep failing" or "connection drops randomly" in a Node.js
  context are strong signals to use this skill. Do NOT use for browser/Web client issues.
---

# ClickHouse Node.js Client Troubleshooting

Reference: https://clickhouse.com/docs/integrations/javascript

> **⚠️ Node.js runtime only.** This skill covers the `@clickhouse/client` package running in a **Node.js runtime** exclusively — including **Next.js Node runtime** API routes, React Server Components, Server Actions, and standard Node.js processes. Do **not** apply this skill to browser client components, Web Workers, **Next.js Edge runtime**, Cloudflare Workers, or any usage of `@clickhouse/client-web`. For browser/edge environments, the correct package is `@clickhouse/client-web`.

---

## How to Use This Skill

1. **Identify the issue** — match symptoms to the Issue Index below and read the corresponding reference file.
2. **Lead with the diagnosis** — explain what's likely causing the issue before giving the fix.
3. **Note version constraints** — flag if a fix requires a minimum client version and check it against what the user provided.
4. **Ask only what's missing** — if the fix is version-dependent and you don't know their version, ask; otherwise help immediately.

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

## Still Stuck?

- [JS client source + full examples](https://github.com/ClickHouse/clickhouse-js/tree/main/examples)
- [ClickHouse JS client docs](https://clickhouse.com/docs/integrations/javascript)
- [ClickHouse supported formats](https://clickhouse.com/docs/interfaces/formats)
