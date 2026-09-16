import { test, expect } from 'bun:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseRuleFile } from '../src/parser'

test('keeps multiple code blocks, headings, tables, and caveats in the compiled body', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skill-parser-'))
  const path = join(directory, 'schema-example.md')
  const body = '**Example:**\n\n```sql\nSELECT 1;\n```\n\n```sql\nSELECT 2;\n```\n\n### Caveat\n\n| Condition | Choice |\n|---|---|\n| Unknown | Preserve NULL |'
  try {
    await writeFile(path, `---\ntitle: Example\nimpact: HIGH\n---\n\n## Example\n\n**Impact: HIGH**\n\n${body}\n`)
    expect((await parseRuleFile(path)).rule.body).toBe(body)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
