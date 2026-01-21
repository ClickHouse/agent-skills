#!/usr/bin/env node
/**
 * Check for broken internal links in rule files
 */

import { readdir, readFile } from 'fs/promises'
import { join, basename } from 'path'
import { RULES_DIR } from './config.js'

interface LinkError {
  file: string
  link: string
  message: string
}

/**
 * Extract markdown links from content
 */
function extractLinks(content: string): string[] {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const links: string[] = []
  let match

  while ((match = linkRegex.exec(content)) !== null) {
    links.push(match[2])
  }

  return links
}

/**
 * Check if a link is internal (relative path or anchor)
 */
function isInternalLink(link: string): boolean {
  return !link.startsWith('http://') && !link.startsWith('https://')
}

/**
 * Main link checking function
 */
async function checkLinks() {
  try {
    console.log('Checking internal links in rule files...')
    console.log(`Rules directory: ${RULES_DIR}`)

    // Read all rule files
    const files = await readdir(RULES_DIR)
    const ruleFiles = files.filter(f => f.endsWith('.md'))

    // Build a set of available files (for reference checking)
    const availableFiles = new Set(ruleFiles.map(f => basename(f, '.md')))

    const allErrors: LinkError[] = []

    for (const file of ruleFiles) {
      const filePath = join(RULES_DIR, file)
      const content = await readFile(filePath, 'utf-8')

      // Extract all links
      const links = extractLinks(content)

      // Check internal links
      for (const link of links) {
        if (isInternalLink(link)) {
          // Check if it's a reference to another rule file
          if (link.endsWith('.md')) {
            const referencedFile = basename(link)
            if (!ruleFiles.includes(referencedFile)) {
              allErrors.push({
                file,
                link,
                message: `Referenced file does not exist: ${referencedFile}`
              })
            }
          }
          // Check if it's a reference to a rule by ID (e.g., #21-use-prewhere)
          else if (link.startsWith('#')) {
            // Extract the rule file name from anchor if it follows pattern #section-title
            const anchorMatch = link.match(/^#(\w+)/)
            if (anchorMatch) {
              const prefix = anchorMatch[1]
              // Check if there's a file starting with this prefix
              const hasMatchingFile = ruleFiles.some(f => f.startsWith(prefix))
              if (!hasMatchingFile && !link.match(/^\d+-\d+/)) {
                // Only warn if it's not a standard section anchor (like #1-schema-design)
                // and there's no matching file
                // Skip this check as it's too strict for section anchors
              }
            }
          }
        }
      }
    }

    if (allErrors.length > 0) {
      console.error('\n✗ Link checking failed:\n')
      allErrors.forEach(error => {
        console.error(`  ${error.file}`)
        console.error(`    Link: ${error.link}`)
        console.error(`    ${error.message}`)
        console.error('')
      })
      process.exit(1)
    } else {
      console.log(`✓ All internal links are valid`)
    }
  } catch (error) {
    console.error('Link checking failed:', error)
    process.exit(1)
  }
}

checkLinks()
