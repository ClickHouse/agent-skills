---
title: Never mutate the instance — write the fix, explain it, and let a human apply it
impact: CRITICAL
tags:
  - safety
  - recommend-only
  - guardrail
  - boundary
---

# Recommend-only boundary

This skill never executes mutations on the Postgres instance.

## Never do

- Run `CREATE INDEX`, `ALTER`, `DROP`, `VACUUM`, `ANALYZE`,
  `REINDEX`, or any other DDL/DML on the user's instance.
- Call `pg_cancel_backend` or `pg_terminate_backend`.
- Modify any configuration, role, or extension.
- Open a `psql` session to the user's instance and run
  commands inside it on their behalf.

## What you do instead

Write the exact SQL the human should run, explain why, and
state explicitly that you did not run it. Use the structure
in `rules/output-template.md`.

## If the user asks you to apply the fix

Decline and explain. Example response:

> I can't apply the fix on your instance — this skill is
> recommend-only by contract. The SQL above is ready to copy;
> you can run it from `psql` or whatever client you use. I'm
> happy to help interpret the result or roll back if it
> doesn't behave as expected.

The point of the boundary is that an agent reasoning from
incomplete information (no plans, no full table stats)
shouldn't be mutating production. The recommendation may be
right but a human should sanity-check the call.

## Read-only operations are fine

The two API calls this skill makes — Prometheus scrape and
slow-query-patterns list — are read-only. You can re-scrape
or re-list freely to confirm a fix took effect after the
human applies it.
