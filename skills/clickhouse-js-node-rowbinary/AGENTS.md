# Recommendations for AI agents — `@clickhouse/rowbinary`

Guidance for the [`clickhouse-js-node-rowbinary`](.) package (the RowBinary codec library and agent skill). See the [repo-root `AGENTS.md`](../../AGENTS.md) for cross-cutting guidance.

This package has a symmetric reader/writer codebase.

## Tests

The tests follow a few conventions worth preserving:

- **Reader and writer tests are separate files.** Readers are tested in `tests/*.test.ts`; writers in
  `tests/*.write.test.ts`. Keep the two independent: a writer test must **never** decode its bytes back
  through a reader (and vice versa), so a bug on one side cannot mask a bug on the other. Writer tests
  assert the encoded bytes against **live ClickHouse output** as the source of truth.
- **Each case is an isolated `it()` with a fully-inline body.** Write the assertion out per case, e.g.
  `expect(encode(writer, value)).toEqual(await query("SELECT … FORMAT RowBinary"))`. Do **not** hide the
  assertion behind a thunk-factory helper (`it("name", expectFoo(...))`), and do **not** wrap the query
  in a per-file helper — embed the literal SQL inline, including any `SETTINGS` clause, so the full
  query is visible in the test. The only shared helpers are the generic `query()` (`tests/clickhouse.ts`,
  runs SQL → bytes) and `encode()` (`tests/encode.ts`, value → bytes). Repeating SQL across cases is
  fine; reviewability beats DRY here. See [`tests/Integers.write.test.ts`](tests/Integers.write.test.ts)
  as the canonical example.

## No defensive validation in readers/writers

These are hot-path codecs. **Do not add runtime validation of input values** (`isFinite`,
range/`NaN` checks, type guards, etc.) to the `readX`/`writeX` functions. The data at this level is
expected to be correct, and an invalid value is a programming error — document the precondition in the
JSDoc instead (see `writeUVarint` and the `writeDate*`/`writeDateTime` writers as the canonical
examples). A `Math.round`-style transform that silently shifts a _valid_ value to the wrong encoding is
a correctness bug and must be fixed; rejecting an _invalid_ value is not our job here.

Two narrow exceptions where a check **is** warranted:

1. **It keeps the protocol in sync.** A check belongs in only when skipping it would desync the wire
   stream — e.g. `writeIPv6` requires exactly 16 bytes because a wrong length shifts every subsequent
   field, and `parseIPv6` rejects malformed groups because it can't otherwise produce 16 well-defined
   bytes. These guard the _framing_, not the user's data semantics.
2. **The cost is genuinely zero or it can't reach the server.** Pure parse-time helpers (string →
   bytes, before anything is on the wire) may validate, since there's no hot loop and no server to fall
   back on.

Otherwise, prefer letting the ClickHouse server reject bad bytes server-side over guarding client-side:
it already validates, and duplicating that on the encode path costs throughput for no real safety.
