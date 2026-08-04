#!/usr/bin/env node
import { globSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import type { FileStamp } from './gate.kernel.js'

import { DEFAULT_SUFFIXES, verdictOf } from './contribution.kernel.js'
import { decideGate, filesMissingFromDisk, filesNewerThanReport, parseMutationReport } from './gate.kernel.js'

const REPORT_FILE = 'reports/mutation-report.json'
const SUFFIX_FLAG = '--suffix='
const SOURCE_GLOB = '**/*.ts'
const NOT_SOURCE = /^(node_modules|dist|reports|coverage)\//

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

const sourceFiles = (packageDir: string): ReadonlyArray<string> =>
  globSync(SOURCE_GLOB, { cwd: packageDir }).filter((entry) => !NOT_SOURCE.test(entry))

const stampsOf = (packageDir: string, files: ReadonlyArray<string>): ReadonlyArray<FileStamp> =>
  files.map((path) => ({ path, modifiedAt: statSync(resolve(packageDir, path)).mtimeMs }))

const testFilesOnDisk = (
  files: ReadonlyArray<string>,
  suffixes: ReadonlyArray<string>,
): ReadonlyArray<string> => files.filter((file) => suffixes.some((suffix) => file.endsWith(suffix)))

const foreignRootOf = (packageDir: string, projectRoot: string | undefined): string | undefined =>
  projectRoot !== undefined && resolve(projectRoot) !== resolve(packageDir) ? projectRoot : undefined

const args = process.argv.slice(2)
const requested = args.filter((arg) => arg.startsWith(SUFFIX_FLAG)).map((arg) => arg.slice(SUFFIX_FLAG.length))
const suffixes = requested.length > 0 ? requested : DEFAULT_SUFFIXES
const packageDir = args.find((arg) => !arg.startsWith('--')) ?? '.'

const reportFile = resolve(packageDir, REPORT_FILE)
const report = parseMutationReport(readJson(reportFile))

const decision = report === undefined
  ? decideGate({ verdict: undefined, reportFile })
  : (() => {
    const files = sourceFiles(packageDir)
    const onDisk = testFilesOnDisk(files, suffixes)
    return decideGate({
      verdict: verdictOf(report, suffixes, onDisk),
      reportFile,
      scopeRequested: requested.length > 0,
      staleFiles: filesNewerThanReport(statSync(reportFile).mtimeMs, stampsOf(packageDir, files)),
      vanishedFiles: filesMissingFromDisk(
        testFilesOnDisk(Object.keys(report.testFiles ?? {}), suffixes),
        onDisk,
      ),
      ...(foreignRootOf(packageDir, report.projectRoot) === undefined
        ? {}
        : { foreignRoot: report.projectRoot }),
    })
  })()

if (decision.ok) {
  process.stdout.write(`${decision.message}\n`)
} else {
  process.stderr.write(`${decision.message}\n`)
  process.exitCode = 1
}
