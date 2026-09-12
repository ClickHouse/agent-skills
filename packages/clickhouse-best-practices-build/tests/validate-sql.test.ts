import { test, expect } from 'bun:test'
import { sqlExamples, validateSQL } from '../src/validate-sql'

const binary = process.env.CLICKHOUSE_BINARY || 'clickhouse'

test('extracts all SQL fences under one label, including CRLF, without Python or text', () => {
  const source = '**Example:**\r\n\r\n```sql\r\nSELECT 1;\r\n```\r\n\r\n```python\r\nprint(1)\r\n```\r\n\r\n```sql\r\nSELECT 2;\r\n```\r\n'
  expect(sqlExamples(source).map(e => e.sql)).toEqual(['SELECT 1;', 'SELECT 2;'])
  expect(sqlExamples(source).map(e => e.line)).toEqual([3, 11])
})

test('parses DDL, multiple statements, and external table functions without executing them', async () => {
  await validateSQL("CREATE TABLE example (id UInt64) ENGINE=MergeTree ORDER BY id; SELECT * FROM url('https://invalid.invalid/data', CSV, 'id UInt64');", binary)
})

test('rejects malformed SQL instead of suppressing the subprocess failure', async () => {
  await expect(validateSQL('SELECT FROM WHERE;', binary)).rejects.toThrow()
})

test('fails if the parser executable is missing', async () => {
  await expect(validateSQL('SELECT 1;', '/nonexistent/clickhouse-parser')).rejects.toThrow()
})
