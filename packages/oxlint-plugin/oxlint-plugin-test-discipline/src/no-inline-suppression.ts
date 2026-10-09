#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

import { scanSuppressions, type Suppression } from './rules/suppression-scan.js'

/**
 * `no-inline-suppression [file...]` — fails when any scanned file holds a comment opening with an
 * oxlint/eslint disable directive, `@ts-expect-error`, `@ts-ignore` or `@ts-nocheck`. With no arguments it scans the git-tracked
 * sources under the working directory. It reads no configuration, and no comment can exempt a file:
 * oxlint obeys a disable directive even for a JS plugin rule that names it, so this check runs outside
 * oxlint.
 *
 * Exit status: 0 clean; 1 a refused comment or an unparseable file; 2 the files could not be listed or read.
 */

const SCANNED_PATHSPECS = ['*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.jsx', '*.mjs', '*.cjs'] as const

const run = promisify(execFile)

/** A file git still tracks but the working tree has deleted: nothing in it can suppress anything. */
const isMissing = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT'

const trackedSources = async (): Promise<readonly string[]> => {
  const { stdout } = await run('git', ['ls-files', '-z', '--', ...SCANNED_PATHSPECS], {
    maxBuffer: 1024 * 1024 * 1024,
  })
  return stdout.split('\0').filter((path) => path.length > 0)
}

const readTracked = async (file: string): Promise<string | undefined> => {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

const describeSuppression = (file: string, suppression: Suppression): string =>
  `${file}:${String(suppression.line)}:${String(suppression.column)}: ${suppression.form} is forbidden. ` +
  'Expected: code that passes lint and type-check with no inline suppression. ' +
  `Actual: a comment opening with ${suppression.form}. ` +
  'Fix: delete the comment and fix what it silenced; no comment or setting inside the file exempts it.'

const describeParseError = (file: string, message: string): string =>
  `${file}: cannot be parsed, so its comments cannot all be graded: ${message}. ` +
  'Fix: make the file parse, then rerun no-inline-suppression.'

const gradeFile = (file: string, sourceText: string): readonly string[] => {
  const scan = scanSuppressions(file, sourceText)
  return [
    ...scan.suppressions.map((suppression) => describeSuppression(file, suppression)),
    ...scan.parseErrors.map((message) => describeParseError(file, message)),
  ]
}

const main = async (args: readonly string[]): Promise<number> => {
  const explicit = args.length > 0
  const files = explicit ? args : await trackedSources()
  const findings: string[] = []
  for (const file of files) {
    const sourceText = explicit ? await readFile(file, 'utf8') : await readTracked(file)
    const lines = sourceText === undefined ? [] : gradeFile(file, sourceText)
    findings.push(...lines)
    if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`)
  }
  if (findings.length === 0) return 0
  process.stderr.write(
    `no-inline-suppression: ${String(findings.length)} finding(s) in ${String(files.length)} scanned file(s).\n`,
  )
  return 1
}
try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  process.stderr.write(`no-inline-suppression: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}
