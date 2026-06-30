/**
 * The one shared test helper: run SQL against a live ClickHouse server over
 * HTTP and return the raw response bytes.
 *
 * Unit tests query ClickHouse directly (no static fixtures) so the bytes under
 * test are always exactly what the server produces. Pass a complete statement
 * including the format, e.g. `SELECT toUInt8(255) FORMAT RowBinary`.
 *
 * Assumes a ClickHouse server is already running. Override the connection with
 * env vars:
 *   CLICKHOUSE_URL       (default http://localhost:8123)
 *   CLICKHOUSE_USER      (default default)
 *   CLICKHOUSE_PASSWORD  (default empty)
 *
 * Note: the suite hard-depends on a reachable server — with none running, every
 * test errors rather than skips. Intentional for now; if a friendlier
 * "no server -> skip with a clear message" behavior is wanted later, add it here.
 */
const URL_BASE = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
const USER = process.env.CLICKHOUSE_USER ?? "default";
const PASSWORD = process.env.CLICKHOUSE_PASSWORD ?? "";

export async function query(sql: string): Promise<Buffer> {
  const res = await fetch(URL_BASE, {
    method: "POST",
    headers: {
      "X-ClickHouse-User": USER,
      "X-ClickHouse-Key": PASSWORD,
    },
    body: sql,
  });
  if (!res.ok) {
    throw new Error(
      `ClickHouse ${res.status} for query: ${sql}\n${await res.text()}`,
    );
  }
  // Buffer.from(ArrayBuffer) is a no-copy view over the response bytes.
  return Buffer.from(await res.arrayBuffer());
}
