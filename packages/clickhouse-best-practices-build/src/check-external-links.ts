#!/usr/bin/env node
/**
 * Check for broken external HTTP/HTTPS links in skill files
 *
 * This script:
 * - Scans all .md and .json files in the skills directory
 * - Extracts HTTP/HTTPS URLs from markdown links and JSON fields
 * - Validates each URL returns a 2XX status code
 * - Processes links asynchronously in batches (max 5 concurrent)
 * - Retries failed links with exponential backoff
 * - Reports detailed errors for any broken links
 */

import { readdir, readFile } from 'fs/promises'
import { join, relative } from 'path'
import { SKILL_DIR } from './config.js'

interface LinkInfo {
  url: string
  source: {
    skill: string
    file: string
  }
}

interface LinkCheckResult {
  url: string
  success: boolean
  statusCode?: number
  error?: string
  source: { skill: string, file: string }
  retriesUsed: number
}

const TIMEOUT_MS = 10000 // 10 seconds
const MAX_RETRIES = 2 // Try up to 2 additional times after initial failure
const CONCURRENCY = 5 // Max concurrent requests per batch
const RETRY_DELAYS = [100, 200, 400] // Exponential backoff delays in ms

/**
 * Extract markdown links from content
 */
function extractMarkdownLinks(content: string): string[] {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const links: string[] = []
  let match

  while ((match = linkRegex.exec(content)) !== null) {
    links.push(match[2])
  }

  return links
}

/**
 * Extract URLs from JSON content (recursively)
 */
function extractJsonUrls(obj: any, urls: string[] = []): string[] {
  if (typeof obj === 'string') {
    if (obj.startsWith('http://') || obj.startsWith('https://')) {
      urls.push(obj)
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      extractJsonUrls(item, urls)
    }
  } else if (obj !== null && typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      extractJsonUrls(value, urls)
    }
  }
  return urls
}

/**
 * Check if a URL is external (HTTP/HTTPS)
 */
function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Validate a single URL with retry logic
 */
async function validateUrl(
  url: string,
  source: { skill: string, file: string },
  timeout: number = TIMEOUT_MS,
  maxRetries: number = MAX_RETRIES
): Promise<LinkCheckResult> {
  let lastError: string = ''
  let lastStatusCode: number | undefined
  let retriesUsed = 0

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Wait before retry with exponential backoff
      const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]
      await sleep(delay)
      retriesUsed++
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        // Try HEAD request first (faster, less bandwidth)
        let response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          redirect: 'follow'
        })

        // If HEAD fails or returns error, try GET
        if (!response.ok) {
          const headStatusCode = response.status
          response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'follow'
          })

          // If GET succeeded but HEAD failed, use GET result
          if (response.ok) {
            clearTimeout(timeoutId)
            return {
              url,
              success: true,
              statusCode: response.status,
              source,
              retriesUsed
            }
          }

          // Both failed, use GET status
          lastStatusCode = response.status
        } else {
          // HEAD succeeded
          clearTimeout(timeoutId)
          return {
            url,
            success: true,
            statusCode: response.status,
            source,
            retriesUsed
          }
        }

        clearTimeout(timeoutId)

        // Check if status code is 2XX
        if (response.status >= 200 && response.status < 300) {
          return {
            url,
            success: true,
            statusCode: response.status,
            source,
            retriesUsed
          }
        }

        lastStatusCode = response.status
        lastError = `${response.status} ${response.statusText}`
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        throw fetchError
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        lastError = 'Request timeout'
      } else if (error.code === 'ENOTFOUND') {
        lastError = 'DNS lookup failed'
      } else if (error.code === 'ECONNREFUSED') {
        lastError = 'Connection refused'
      } else {
        lastError = error.message || 'Unknown error'
      }
    }
  }

  // All retries exhausted
  return {
    url,
    success: false,
    statusCode: lastStatusCode,
    error: lastError,
    source,
    retriesUsed
  }
}

/**
 * Validate URLs in batches with concurrency limit
 */
async function validateUrlsBatch(
  linkInfos: LinkInfo[],
  concurrency: number
): Promise<LinkCheckResult[]> {
  const results: LinkCheckResult[] = []

  // Process in batches
  for (let i = 0; i < linkInfos.length; i += concurrency) {
    const batch = linkInfos.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(
      batch.map(info => validateUrl(info.url, info.source))
    )

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        // This shouldn't happen as validateUrl catches all errors
        // but handle it just in case
        const info = batch[results.length % batch.length]
        results.push({
          url: info.url,
          success: false,
          error: result.reason?.message || 'Unknown error',
          source: info.source,
          retriesUsed: 0
        })
      }
    }

    // Show progress
    console.log(`Checked ${Math.min(i + concurrency, linkInfos.length)}/${linkInfos.length} links...`)
  }

  return results
}

/**
 * Print summary table of results
 */
function printSummaryTable(results: LinkCheckResult[]): void {
  console.log('\n' + '='.repeat(80))
  console.log('External Links Check Summary')
  console.log('='.repeat(80) + '\n')

  // Sort: failures first, then by URL
  const sortedResults = [...results].sort((a, b) => {
    if (a.success !== b.success) {
      return a.success ? 1 : -1
    }
    return a.url.localeCompare(b.url)
  })

  // Print table header
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐')
  console.log('│ URL                                                      │ Status │ Source  │')
  console.log('├──────────────────────────────────────────────────────────┼────────┼─────────┤')

  for (const result of sortedResults) {
    const truncatedUrl = result.url.length > 56
      ? result.url.substring(0, 53) + '...'
      : result.url
    const statusText = result.success
      ? `${result.statusCode} ✓`
      : result.statusCode
        ? `${result.statusCode} ✗`
        : 'ERR ✗'
    const sourceFile = result.source.file.length > 12
      ? '...' + result.source.file.substring(result.source.file.length - 9)
      : result.source.file

    console.log(
      `│ ${truncatedUrl.padEnd(56)} │ ${statusText.padEnd(6)} │ ${sourceFile.padEnd(7)} │`
    )
  }

  console.log('└──────────────────────────────────────────────────────────┴────────┴─────────┘')

  // Print summary counts
  const passed = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  console.log(`\nSummary: ${results.length} links checked, ${passed} passed, ${failed} failed`)
}

/**
 * Print detailed error information
 */
function printDetailedErrors(results: LinkCheckResult[]): void {
  const failures = results.filter(r => !r.success)

  if (failures.length === 0) {
    return
  }

  console.log('\n✗ External link checking failed:\n')

  for (const failure of failures) {
    console.log(`  ${failure.source.file}`)
    console.log(`    Link: ${failure.url}`)
    if (failure.statusCode) {
      console.log(`    Status: ${failure.statusCode}`)
    }
    if (failure.error) {
      console.log(`    Error: ${failure.error}`)
    }
    console.log(`    (Verified with ${failure.retriesUsed} retries)`)
    console.log('')
  }
}

/**
 * Recursively find all files with given extensions
 * Excludes files starting with underscore (templates and metadata)
 */
async function findFiles(dir: string, extensions: string[]): Promise<string[]> {
  const files: string[] = []

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)

      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        // Skip files starting with underscore (templates, metadata)
        if (entry.name.startsWith('_')) {
          continue
        }

        const hasExtension = extensions.some(ext => entry.name.endsWith(ext))
        if (hasExtension) {
          files.push(fullPath)
        }
      }
    }
  }

  await walk(dir)
  return files
}

/**
 * Main external link checking function
 */
async function checkExternalLinks(): Promise<void> {
  try {
    console.log('Checking external links...')
    console.log(`Skill directory: ${SKILL_DIR}\n`)

    // Find all .md and .json files
    const files = await findFiles(SKILL_DIR, ['.md', '.json'])
    console.log(`Found ${files.length} files to scan\n`)

    // Collect all external links with their sources
    const linkMap = new Map<string, LinkInfo>()

    for (const filePath of files) {
      const content = await readFile(filePath, 'utf-8')
      const relativePath = relative(SKILL_DIR, filePath)
      let urls: string[] = []

      if (filePath.endsWith('.md')) {
        urls = extractMarkdownLinks(content).filter(isExternalUrl)
      } else if (filePath.endsWith('.json')) {
        try {
          const jsonData = JSON.parse(content)
          urls = extractJsonUrls(jsonData).filter(isExternalUrl)
        } catch (error) {
          console.warn(`Warning: Could not parse JSON file ${relativePath}`)
          continue
        }
      }

      // Add to map (deduplicate URLs, but keep first source)
      for (const url of urls) {
        if (!linkMap.has(url)) {
          linkMap.set(url, {
            url,
            source: {
              skill: 'clickhouse-best-practices',
              file: relativePath
            }
          })
        }
      }
    }

    const uniqueLinks = Array.from(linkMap.values())

    if (uniqueLinks.length === 0) {
      console.log('No external links found')
      return
    }

    console.log(`Found ${uniqueLinks.length} unique external links\n`)

    // Validate all URLs in batches
    const results = await validateUrlsBatch(uniqueLinks, CONCURRENCY)

    // Print summary table
    printSummaryTable(results)

    // Check for failures
    const failures = results.filter(r => !r.success)

    if (failures.length > 0) {
      printDetailedErrors(results)
      process.exit(1)
    } else {
      console.log(`\n✓ All ${results.length} external links are valid`)
    }
  } catch (error) {
    console.error('External link checking failed:', error)
    process.exit(1)
  }
}

checkExternalLinks()
