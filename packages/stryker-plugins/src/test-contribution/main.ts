#!/usr/bin/env node
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { DEFAULT_SUFFIXES, verdictOf } from './contribution.kernel.js'
import { decideGate, parseMutationReport } from './gate.kernel.js'

const REPORT_FILE = 'reports/mutation-report.json'
const STRYKER_CONFIG = 'stryker.config.json'
const SUFFIX_FLAG = '--suffix='
const NOT_SOURCE = /(^|\/)(node_modules|dist|reports|coverage)(\/|$)/

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

const recordsEveryKiller = (config: unknown): boolean =>
  typeof config === 'object' && config !== null && 'disableBail' in config && config.disableBail === true

const testFilesOnDisk = (packageDir: string, suffixes: ReadonlyArray<string>): ReadonlyArray<string> =>
  suffixes.flatMap((suffix) =>
    globSync(`**/*${suffix}`, { cwd: packageDir, exclude: (entry) => NOT_SOURCE.test(entry) })
  )

const args = process.argv.slice(2)
const requested = args.filter((arg) => arg.startsWith(SUFFIX_FLAG)).map((arg) => arg.slice(SUFFIX_FLAG.length))
const suffixes = requested.length > 0 ? requested : DEFAULT_SUFFIXES
const packageDir = args.find((arg) => !arg.startsWith('--')) ?? '.'

const reportFile = resolve(packageDir, REPORT_FILE)
const report = parseMutationReport(readJson(reportFile))
const verdict = report === undefined ? undefined : verdictOf(
  report,
  recordsEveryKiller(readJson(resolve(packageDir, STRYKER_CONFIG))),
  suffixes,
  testFilesOnDisk(packageDir, suffixes),
)
const decision = decideGate(verdict, reportFile)

if (decision.ok) {
  process.stdout.write(`${decision.message}\n`)
} else {
  process.stderr.write(`${decision.message}\n`)
  process.exitCode = 1
}
