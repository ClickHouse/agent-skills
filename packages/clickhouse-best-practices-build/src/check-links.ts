#!/usr/bin/env node
/** Check relative Markdown file links throughout the skill, including its router. */
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { SKILL_DIR } from './config.js'

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await markdownFiles(path))
    else if (entry.name.endsWith('.md')) files.push(path)
  }
  return files
}

async function checkLinks() {
  const errors: string[] = []
  let count = 0
  for (const file of await markdownFiles(SKILL_DIR)) {
    const text = await readFile(file, 'utf8')
    for (const match of text.matchAll(/\[[^\]]+\]\(([^\s)]+)\)/g)) {
      const link = match[1]
      if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith('#')) continue
      const target = decodeURIComponent(link.split('#')[0])
      count++
      try {
        await stat(resolve(dirname(file), target))
      } catch {
        errors.push(`${relative(SKILL_DIR, file)}: missing ${target}`)
      }
    }
  }
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(`✓ ${count} relative file links resolve (anchors and external URLs are not checked)`)
}
checkLinks().catch(error => {
  console.error(error)
  process.exitCode = 1
})
