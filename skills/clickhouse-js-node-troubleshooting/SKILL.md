---
name: clickhouse-js-node-troubleshooting
description: Diagnose failures in @clickhouse/client on Node.js, including connection resets, result handling, types, authentication, TLS, and query formatting. Use for reported client symptoms; excludes browser/edge clients.
metadata:
  version: "0.2.0"
---

# ClickHouse Node.js client troubleshooting

Use observed errors, effective configuration, and installed client/Node/server versions to choose a diagnostic path. Reuse supplied evidence and inspect available package manifests before asking the user for versions. For incomplete evidence, distinguish a likely cause from a confirmed diagnosis.

Read the relevant reference rather than every troubleshooting topic. Apply the smallest supported fix and verify the original symptom. Do not broaden the task into a client rewrite, change database privileges, or disable certificate verification simply because an example mentions it. Avoid blindly retrying writes whose outcome is unknown.

## Issue references

- [Socket Hang-Up / ECONNRESET](reference/socket-hangup.md)
- [Data Type Mismatches](reference/data-types.md)
- [Read-Only User Errors](reference/readonly-users.md)
- [Proxy / Pathname URL Confusion](reference/proxy-pathname.md)
- [TLS / Certificate Errors](reference/tls.md)
- [Compression Not Working](reference/compression.md)
- [Logging Not Showing Anything](reference/logging.md)
- [Query Parameters Not Interpolated](reference/query-params.md)
- [FORMAT Clause / `SHOW POLICIES` Errors](reference/query-format-clause.md)

Version notes in the references help identify applicable fixes; check uncertain or changed behavior against the installed source and [official documentation](https://clickhouse.com/docs/integrations/javascript). For ordinary new client code, use the coding skill only if its guidance is needed.

Report the cause supported by evidence, the fix or next diagnostic, and what was verified. A focused question does not require an exhaustive troubleshooting report.
