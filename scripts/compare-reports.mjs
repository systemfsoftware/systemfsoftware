#!/usr/bin/env node

/**
 * Compare two Stryker mutation report JSON files.
 *
 * Scenarios:
 *   - Perfect match: exit 0
 *   - Timeout mismatches: log warning, exit 0
 *   - Non-Timeout mismatches: log error, exit 1
 *   - Extra mutants in generated: log warning, exit 1
 *   - Empty files (no mutants): exit 0
 *
 * Usage:
 *   scripts/compare-reports.mjs --baseline <path> --generated <path>
 */

import { readFileSync } from 'node:fs'

function parseArgs() {
  const args = process.argv.slice(2)
  const baselineIdx = args.indexOf('--baseline')
  const generatedIdx = args.indexOf('--generated')
  if (baselineIdx === -1 || generatedIdx === -1) {
    console.error('Usage: scripts/compare-reports.mjs --baseline <path> --generated <path>')
    process.exit(2)
  }
  const baselinePath = args[baselineIdx + 1]
  const generatedPath = args[generatedIdx + 1]
  if (!baselinePath || !generatedPath) {
    console.error('ERROR: --baseline and --generated require file paths')
    process.exit(2)
  }
  return { baselinePath, generatedPath }
}

function readReport(path) {
  const raw = readFileSync(path, 'utf-8').trim()
  if (raw.length === 0) {
    return { files: {} }
  }
  return JSON.parse(raw)
}

/**
 * Flatten mutant list from report into a Map<compositeKey, { file, id, status }>.
 * Composite key = `filePath:id` to handle per-file sequential IDs.
 */
function flattenMutants(report) {
  const map = new Map()
  const files = report.files ?? {}
  for (const [filePath, fileData] of Object.entries(files)) {
    const mutants = fileData.mutants ?? []
    for (const mutant of mutants) {
      const key = `${filePath}:${mutant.id}`
      map.set(key, { file: filePath, id: mutant.id, status: mutant.status })
    }
  }
  return map
}

function main() {
  const { baselinePath, generatedPath } = parseArgs()
  const baseline = readReport(baselinePath)
  const generated = readReport(generatedPath)

  const baselineMutants = flattenMutants(baseline)
  const generatedMutants = flattenMutants(generated)

  let exitCode = 0
  let hasTimeoutMismatch = false
  let hasNonTimeoutMismatch = false
  let hasExtra = false

  // Check each baseline mutant exists in generated with the same status
  for (const [key, baselineM] of baselineMutants) {
    const genM = generatedMutants.get(key)
    if (!genM) {
      const isTimeout = baselineM.status === 'Timeout'
      const level = isTimeout ? 'WARN' : 'ERROR'
      console.error(`${level}: mutant ${key} (baseline status=${baselineM.status}) is missing in generated report`)
      if (isTimeout) {
        hasTimeoutMismatch = true
      } else {
        hasNonTimeoutMismatch = true
      }
      continue
    }
    if (genM.status !== baselineM.status) {
      const isTimeout = baselineM.status === 'Timeout' || genM.status === 'Timeout'
      const level = isTimeout ? 'WARN' : 'ERROR'
      console.error(
        `${level}: mutant ${key} status mismatch: baseline=${baselineM.status}, generated=${genM.status}`,
      )
      if (isTimeout) {
        hasTimeoutMismatch = true
      } else {
        hasNonTimeoutMismatch = true
      }
    }
  }

  // Check for extra mutants in generated report
  for (const [key] of generatedMutants) {
    if (!baselineMutants.has(key)) {
      console.error(`WARN: extra mutant ${key} in generated report (not in baseline)`)
      hasExtra = true
    }
  }

  // Determine exit code
  if (hasNonTimeoutMismatch) {
    exitCode = 1
  }
  if (hasExtra) {
    exitCode = 1
  }
  if (hasTimeoutMismatch && !hasNonTimeoutMismatch && !hasExtra) {
    exitCode = 0
  }

  if (exitCode === 0) {
    if (hasTimeoutMismatch) {
      console.error('PASS: only timeout differences detected (exit 0)')
    } else if (baselineMutants.size === 0 && generatedMutants.size === 0) {
      console.error('PASS: both reports are empty (exit 0)')
    } else {
      console.error('PASS: reports match (exit 0)')
    }
  } else {
    console.error('FAIL: reports differ (exit 1)')
  }
  process.exit(exitCode)
}

main()
