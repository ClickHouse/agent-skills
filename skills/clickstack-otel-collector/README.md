# Maintaining the ClickStack collector skill

`SKILL.md` routes to connection, deployment, verification and cleanup references. Keep version-specific environment keys, migration grants and error examples in those references; check them against the CLI and collector release being used. Do not turn a workaround from one release into a universal diagnosis.

Before publishing an update, check Markdown links and shell/YAML examples. A live integration check needs a disposable service and an explicitly selected image version; it is separate from static documentation validation. Verify both a fresh collector and a pre-existing collector with credentials and routing that must be preserved. Record actual ingestion evidence, not just historical row counts.

Skill version 0.7.0 reorganizes and scopes the existing recipes. The live deployment workflow has not been rerun as part of this documentation update.
