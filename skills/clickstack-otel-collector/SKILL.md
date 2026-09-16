---
name: clickstack-otel-collector
description: Connect a new or existing OpenTelemetry collector to Managed ClickStack on ClickHouse Cloud, or diagnose and verify that ingestion path.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.7.0"
---

# Managed ClickStack collector

Configure the requested ingestion path and verify the signals the user needs. This skill covers a local ClickStack collector via Docker/Compose and exporter configuration for an existing gateway collector. Full Kubernetes deployment is outside these recipes.

## Choose the work from context

Use the stated target, existing collector, deployment files, authentication and prior authorization. Ask only for missing choices that affect the result. For a new local setup with no preference, use Compose when available. An existing collector needs a configuration change, not another collector. A configuration-only request does not require provisioning an ingest identity, sending telemetry or opening the console.

Read the relevant reference:

- [Connection and credentials](references/setup.md): resolve the service, authenticate the CLI, configure the endpoint and provision an ingest user when needed.
- [Deployment](references/deployment.md): choose Compose, Docker run, or merge an exporter into an existing collector.
- [Verification](references/verification.md): verify actual ingestion, optionally generate bounded demo data, and check UI source setup.
- [Cleanup](references/cleanup.md): remove task-owned resources when requested.

## Operational constraints

- Resolve exactly one target before writing. Preserve existing credentials, users, containers and collector configuration on retries; never rotate a password or replace a running collector just to make setup repeatable.
- Use the host's actual permission policy. Do not request blanket command allowlists or predeclare operations safe to approve. Existing task authorization remains valid; ask only for a material action outside it.
- Keep secrets out of chat and ordinary logs. Use private files or the project's secret mechanism; the recipes preserve exact environment keys and password/endpoint constraints that the collector requires.
- Check the installed CLI and collector image version when commands, components or migration grants differ. Grant only what that version needs; do not expand database access speculatively.
- Preserve existing receiver authentication, routing and retention. The example topology is not a replacement for an existing configuration.
- Synthetic telemetry is optional and must be clearly distinguishable from real traffic. Existing table row counts alone do not prove this collector delivered new data.

Report what was configured, what evidence verified it, any remaining failure, and the relevant endpoint, private configuration path and stop command. Claim ClickStack UI visibility only when it was observed or confirmed by the user. Scale the handoff to the work completed.
