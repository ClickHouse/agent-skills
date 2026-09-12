---
title: Keep diagnosis separate from applying a fix
impact: CRITICAL
tags:
  - safety
  - recommend-only
  - boundary
---

# Diagnostic boundary

A performance investigation authorizes evidence collection and recommendations, not changes to the database. Within this RCA workflow, do not execute DDL/DML, maintenance commands, cancel queries, or change configuration, roles, or extensions.

Write a proposed fix only when the evidence supports it. Identify assumptions that need confirmation, and distinguish SQL suggested from commands actually run. Do not imply that a candidate index is ready for production solely because an IO ratio is high.

If the user separately requests implementation, treat that as a new scope: use appropriate implementation tools, verify the target and relevant schema/plan, and apply the user's authorization and operational safeguards. Do not refuse solely because this diagnostic skill is recommend-only, and do not infer approval from the original diagnosis request.

Read-only API calls can confirm a fix after it is applied. Reuse the same incident/comparison windows and report what changed rather than repeating diagnostics without a purpose.
