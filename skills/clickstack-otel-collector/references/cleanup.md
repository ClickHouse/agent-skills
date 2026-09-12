# Cleanup

Remove only resources created for this task and requested for removal. Confirm ownership from the recorded setup; a matching name is not proof.

## Cleanup (only if the user explicitly asks)

```bash
# Docker Compose deployment:
( cd "$WORKDIR" && docker compose down )

# Individual Docker deployment:
docker rm -f clickstack-otel-collector
docker network rm clickstack-net 2>/dev/null || true

# Only if this task created the identity and no other collector uses it:
clickhousectl cloud service query --id "$SERVICE_ID" --query "DROP USER IF EXISTS hyperdx_ingest"

# Optionally remove the local files once they are no longer needed:
# rm -f "$WORKDIR/collector.env" "$WORKDIR/svc.json" "$WORKDIR/docker-compose.yaml"
```

Do **not** drop the `otel` database: it contains telemetry the user may want to retain.
