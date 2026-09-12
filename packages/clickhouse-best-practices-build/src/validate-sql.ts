#!/usr/bin/env node
/** Parse every SQL fence without executing examples or connecting to a database. */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { RULES_DIR } from './config.js'

const execFileAsync = promisify(execFile)

export function sqlExamples(markdown: string): { sql: string; line: number }[] {
  return [...markdown.matchAll(/^```sql[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*$/gm)].map(match => ({
    sql: match[1].trim(),
    line: markdown.slice(0, match.index).split('\n').length,
  }))
}

export async function validateSQL(sql: string, binary: string): Promise<void> {
  // Argument arrays avoid shell interpolation. `format` parses but never executes SQL.
  await execFileAsync(binary, ['format', '--quiet', '--multiquery', '--query', sql], {
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  })
}

export async function validateSQLInRules(binary = process.env.CLICKHOUSE_BINARY || 'clickhouse'): Promise<void> {
  // A missing or broken binary is a failed check, never a successful skip.
  const { stdout } = await execFileAsync(binary, ['local', '--version'], { timeout: 10000 })
  console.log(`SQL parser: ${stdout.trim()}`)
  const files = (await readdir(RULES_DIR)).filter(f => f.endsWith('.md') && !f.startsWith('_')).sort()
  const errors: string[] = []
  let count = 0
  for (const file of files) {
    const markdown = await readFile(join(RULES_DIR, file), 'utf8')
    for (const example of sqlExamples(markdown)) {
      count++
      try {
        await validateSQL(example.sql, binary)
      } catch (error) {
        errors.push(`${file}:${example.line}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  if (count === 0) throw new Error('No SQL examples found')
  if (errors.length) throw new Error(errors.join('\n\n'))
  console.log(`✓ Parsed ${count} SQL blocks; runtime semantics and performance are not validated`)
}

if (process.argv[1]?.endsWith('/validate-sql.ts')) {
  validateSQLInRules().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
