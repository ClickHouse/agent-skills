#!/usr/bin/env node
/**
 * Validate SQL syntax in rule files using ClickHouse binary
 */

import { readdir, readFile, writeFile, mkdir, chmod, stat } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { parseRuleFile } from './parser.js'
import { RULES_DIR, BUILD_DIR } from './config.js'

const execAsync = promisify(exec)

const CLICKHOUSE_VERSION = '24.1.8.22'
const CLICKHOUSE_BINARY_NAME = 'clickhouse'
const CLICKHOUSE_DIR = join(BUILD_DIR, 'bin')
const CLICKHOUSE_BINARY = join(CLICKHOUSE_DIR, CLICKHOUSE_BINARY_NAME)

interface SQLValidationError {
  file: string
  ruleTitle: string
  exampleLabel: string
  error: string
  sql: string
}

/**
 * Detect the current platform
 */
function getPlatform(): 'macos' | 'linux' | 'unsupported' {
  const platform = process.platform
  if (platform === 'darwin') return 'macos'
  if (platform === 'linux') return 'linux'
  return 'unsupported'
}

/**
 * Get the download URL for ClickHouse binary
 */
function getDownloadUrl(): string | null {
  const platform = getPlatform()
  if (platform === 'macos') {
    return `https://github.com/ClickHouse/ClickHouse/releases/download/v${CLICKHOUSE_VERSION}/clickhouse-macos`
  } else if (platform === 'linux') {
    return `https://github.com/ClickHouse/ClickHouse/releases/download/v${CLICKHOUSE_VERSION}/clickhouse`
  }
  return null
}

/**
 * Download ClickHouse binary if not present
 */
async function ensureClickHouse(): Promise<boolean> {
  try {
    // Check if binary already exists
    await stat(CLICKHOUSE_BINARY)
    console.log('✓ ClickHouse binary found')
    return true
  } catch {
    // Binary doesn't exist, need to download
    console.log('Downloading ClickHouse binary...')

    const url = getDownloadUrl()
    if (!url) {
      console.error('✗ Unsupported platform. SQL validation requires macOS or Linux.')
      return false
    }

    try {
      // Create bin directory if it doesn't exist
      await mkdir(CLICKHOUSE_DIR, { recursive: true })

      // Download using curl
      await execAsync(`curl -L -o "${CLICKHOUSE_BINARY}" "${url}"`)

      // Make executable
      await chmod(CLICKHOUSE_BINARY, 0o755)

      console.log('✓ ClickHouse binary downloaded')
      return true
    } catch (error) {
      console.error('✗ Failed to download ClickHouse binary:', error)
      return false
    }
  }
}

/**
 * Validate a single SQL snippet
 */
async function validateSQL(sql: string): Promise<string | null> {
  // Write SQL to temporary file
  const tmpFile = join(tmpdir(), `clickhouse-validate-${Date.now()}.sql`)
  await writeFile(tmpFile, sql, 'utf-8')

  try {
    // Run clickhouse-local with the SQL file
    // We use FORMAT Null to avoid any output, just check syntax
    const { stderr } = await execAsync(
      `"${CLICKHOUSE_BINARY}" local --query "$(cat "${tmpFile}")" --output-format Null 2>&1 || true`
    )

    // ClickHouse returns errors in stderr
    if (stderr && (stderr.includes('Exception') || stderr.includes('Error'))) {
      return stderr.trim()
    }

    return null
  } catch (error) {
    if (error instanceof Error) {
      return error.message
    }
    return String(error)
  } finally {
    // Clean up temp file
    try {
      await execAsync(`rm -f "${tmpFile}"`)
    } catch {}
  }
}

/**
 * Main validation function
 */
async function validateSQLInRules() {
  try {
    console.log('Validating SQL syntax in rule files...')
    console.log(`Rules directory: ${RULES_DIR}`)

    // Ensure ClickHouse binary is available
    const hasClickHouse = await ensureClickHouse()
    if (!hasClickHouse) {
      console.warn('⚠ Skipping SQL validation (ClickHouse binary not available)')
      process.exit(0)
    }

    // Read all rule files
    const files = await readdir(RULES_DIR)
    const ruleFiles = files.filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')

    const allErrors: SQLValidationError[] = []
    let totalSQLExamples = 0

    for (const file of ruleFiles) {
      const filePath = join(RULES_DIR, file)
      try {
        const { rule } = await parseRuleFile(filePath)

        // Extract SQL examples
        for (const example of rule.examples) {
          if (example.code && example.code.trim() && (example.language === 'sql' || !example.language)) {
            totalSQLExamples++
            const error = await validateSQL(example.code)

            if (error) {
              allErrors.push({
                file,
                ruleTitle: rule.title,
                exampleLabel: example.label,
                error,
                sql: example.code.slice(0, 100) + (example.code.length > 100 ? '...' : '')
              })
            }
          }
        }
      } catch (error) {
        console.error(`Error processing ${file}:`, error)
      }
    }

    if (allErrors.length > 0) {
      console.error('\n✗ SQL validation failed:\n')
      allErrors.forEach(error => {
        console.error(`  ${error.file} (${error.ruleTitle})`)
        console.error(`    Example: ${error.exampleLabel}`)
        console.error(`    SQL: ${error.sql}`)
        console.error(`    Error: ${error.error}`)
        console.error('')
      })
      process.exit(1)
    } else {
      console.log(`✓ All ${totalSQLExamples} SQL examples are valid`)
    }
  } catch (error) {
    console.error('SQL validation failed:', error)
    process.exit(1)
  }
}

validateSQLInRules()
