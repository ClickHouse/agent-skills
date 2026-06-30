# `query()` FORMAT Clause Errors (incl. `SHOW [ROW] POLICIES`)

> **Applies to:** all versions.

`client.query()` is for statements that return a result set (such as `SELECT`). It **always appends `FORMAT <format>`** to the end of the `query` string, where `<format>` comes from the `format` option (default `JSON`). You should therefore **not** include a `FORMAT` clause in the `query` yourself.

```js
// What you write:
await client.query({ query: "SELECT 1", format: "JSONEachRow" });

// What the client actually sends:
// SELECT 1
// FORMAT JSONEachRow
```

## Duplicate `FORMAT` — syntax error

If the `query` string already contains a `FORMAT` clause, the client still appends another one, producing a duplicate `FORMAT` and a server-side syntax error. This is intended behavior.

```js
// ❌ Wrong — ends up as `... FORMAT CSV FORMAT JSON` → syntax error
await client.query({ query: "SELECT 1 FORMAT CSV" });

// ✓ Correct — let the client append FORMAT via the option
await client.query({ query: "SELECT 1", format: "CSV" });
```

If you genuinely need to write the full SQL yourself (including the `FORMAT` clause), or you're running a statement where the appended `FORMAT` suffix is not supported, use `client.exec()` instead of `client.query()`. Use `client.insert()` for data insertion and `client.command()` for DDLs.

## `SHOW [ROW] POLICIES` fails even with a format

Some statements are not parsed by the server with a trailing `FORMAT` clause, so the `FORMAT` suffix that `query()` always appends triggers a syntax error. The most common case is the **short** form of `SHOW POLICIES` / `SHOW ROW POLICIES` — at the server SQL parser level it does not accept the `FORMAT` suffix.

```js
// ❌ Fails — query() appends `FORMAT JSON`, which the short SHOW POLICIES syntax rejects
await client.query({ query: "SHOW POLICIES", format: "JSON" });
await client.query({ query: "SHOW ROW POLICIES", format: "JSON" });
```

**Fix:** use the full syntax `SHOW POLICIES ON *` (or `SHOW POLICIES ON db.table`), which the parser accepts together with the appended `FORMAT`:

```js
// ✓ Works — full syntax accepts the appended FORMAT clause
await client.query({ query: "SHOW POLICIES ON *", format: "JSON" });
```

Alternatively, run the short statement through `client.exec()`, where you control the full SQL and no `FORMAT` suffix is appended.

This behavior is easy to misdiagnose because the error looks like a generic syntax error rather than a client/format problem. See the upstream issue: https://github.com/ClickHouse/ClickHouse/issues/105899
