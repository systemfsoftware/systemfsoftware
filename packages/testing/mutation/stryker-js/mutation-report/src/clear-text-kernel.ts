import type { Position, schema, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { MutationTestMetricsResult } from '@systemfsoftware/stryker-js-plugin-api/report'
import * as Predicate from 'effect/Predicate'

import { ansi } from './ansi.js'
import { ClearTextScoreTable } from './clear-text-score-table.js'
import { getEmojiForStatus, plural } from './render-text.js'

function sourceLocation(fileName: string, position: Position, allowColor: boolean): string {
  const file = allowColor ? ansi.cyan(fileName) : fileName
  const line = allowColor ? ansi.wrap('yellow', String(position.line)) : String(position.line)
  const col = allowColor ? ansi.wrap('yellow', String(position.column)) : String(position.column)
  return [file, line, col].join(':')
}

function mutantLabel(status: schema.MutantStatus, allowEmojis: boolean): string {
  if (allowEmojis) {
    return `${getEmojiForStatus(status)} ${status}`
  }
  return status
}

type ReportMutant = schema.MutantResult & { fileName: string }

function extractReportMutants(
  report: schema.MutationTestResult,
): Array<{ fileName: string; mutant: ReportMutant; source: string | undefined }> {
  const out: Array<{ fileName: string; mutant: ReportMutant; source: string | undefined }> = []
  if (!Predicate.hasProperty(report, 'files')) return out
  for (const [fileName, file] of Object.entries(report.files)) {
    const mutants: readonly schema.MutantResult[] = file.mutants ?? []
    const source: string | undefined = file.source
    for (const mutant of mutants) {
      out.push({ fileName, mutant: { ...mutant, fileName }, source })
    }
  }
  return out
}

function sliceSource(source: string | undefined, position: Position): string[] {
  if (source === undefined) return []
  const lines = source.split('\n')
  const raw = lines[position.line - 1] ?? ''
  if (raw.length === 0) return []
  return [raw.slice(position.column)]
}

function originalLines(source: string | undefined, position: Position, allowColor: boolean): string[] {
  return sliceSource(source, position).map((l) => allowColor ? ansi.red(`-   ${l}`) : `-   ${l}`)
}

function replacementLines(replacement: string | undefined, allowColor: boolean): string[] {
  if (replacement === undefined) return []
  return replacement.split('\n').filter(Boolean).map((l) => allowColor ? ansi.green(`+   ${l}`) : `+   ${l}`)
}

function statusTail(mutant: ReportMutant, options: StrykerOptions): string[] {
  if (mutant.status === 'Survived') {
    if (mutant.static) {
      return ['Ran all tests for this mutant.']
    }
    if (mutant.coveredBy !== undefined && options.clearTextReporter.logTests) {
      return formatCoveredTests(mutant.coveredBy, options)
    }
    return []
  }
  if (mutant.status === 'Killed' && mutant.killedBy !== undefined && mutant.killedBy.length > 0) {
    const first = mutant.killedBy[0]
    if (first !== undefined) return [`Killed by: ${first}`]
  }
  if ((mutant.status === 'RuntimeError' || mutant.status === 'CompileError') && mutant.statusReason !== undefined) {
    return [`Error message: ${mutant.statusReason}`]
  }
  return []
}

function formatCoveredTests(tests: readonly string[], options: StrykerOptions): string[] {
  const count = Math.min(options.clearTextReporter.maxTestsToLog, tests.length)
  if (count <= 0) return []
  const out: string[] = ['Tests ran:']
  for (const t of tests.slice(0, count)) {
    out.push(`    ${t}`)
  }
  const diff = tests.length - options.clearTextReporter.maxTestsToLog
  if (diff > 0) {
    out.push(`  and ${diff} more test${plural(diff)}!`)
  }
  out.push('')
  return out
}

function mutantBlock(
  fileName: string,
  mutant: ReportMutant,
  source: string | undefined,
  options: StrykerOptions,
): string[] {
  const allowColor = options.clearTextReporter.allowColor
  const allowEmojis = options.clearTextReporter.allowEmojis
  const out: string[] = []
  out.push(`[${mutantLabel(mutant.status, allowEmojis)}] ${mutant.mutatorName}`)
  out.push(sourceLocation(fileName, mutant.location.start, allowColor))
  out.push(...originalLines(source, mutant.location.start, allowColor))
  out.push(...replacementLines(mutant.replacement, allowColor))
  out.push(...statusTail(mutant, options))
  out.push('')
  return out
}

function isDebugStatus(status: string): boolean {
  return status === 'Killed' || status === 'Timeout' || status === 'RuntimeError' || status === 'CompileError'
}

function isInfoStatus(status: string): boolean {
  return status === 'Survived' || status === 'NoCoverage'
}

function collectMutants(
  report: schema.MutationTestResult,
  options: StrykerOptions,
): { stdout: string[]; debug: string[]; totalTests: number } {
  const stdout: string[] = []
  const debug: string[] = []
  let totalTests = 0
  for (const { fileName, mutant, source } of extractReportMutants(report)) {
    totalTests += mutant.testsCompleted ?? 0
    if (isDebugStatus(mutant.status)) {
      debug.push(...mutantBlock(fileName, mutant, source, options))
    } else if (isInfoStatus(mutant.status)) {
      stdout.push(...mutantBlock(fileName, mutant, source, options))
    }
  }
  return { stdout, debug, totalTests }
}

function scoreTable(metrics: MutationTestMetricsResult, options: StrykerOptions): string | undefined {
  const shouldDraw = options.clearTextReporter.reportScoreTable &&
    (!options.clearTextReporter.skipFull ||
      metrics.systemUnderTestMetrics.childResults.some(
        (x) => x.metrics.mutationScore !== 100,
      ))
  if (!shouldDraw) return undefined
  return new ClearTextScoreTable(metrics.systemUnderTestMetrics, options).draw()
}

export function renderClearText(
  report: schema.MutationTestResult,
  metrics: MutationTestMetricsResult,
  options: StrykerOptions,
): { stdout: string[]; debug: string[] } {
  const stdout: string[] = []
  const debug: string[] = []
  stdout.push('')
  if (options.clearTextReporter.reportMutants) {
    stdout.push('')
    const { stdout: s, debug: d, totalTests } = collectMutants(report, options)
    stdout.push(...s)
    debug.push(...d)
    const total = metrics.systemUnderTestMetrics.metrics.totalMutants
    const avg = total === 0 ? '0.00' : (totalTests / total).toFixed(2)
    stdout.push(`Ran ${avg} tests per mutant on average.`)
  }
  const table = scoreTable(metrics, options)
  if (table !== undefined) stdout.push(table)
  return { stdout, debug }
}

export function renderClearTextString(
  report: schema.MutationTestResult,
  metrics: MutationTestMetricsResult,
  options: StrykerOptions,
): string {
  const { stdout } = renderClearText(report, metrics, options)
  return stdout.join('\n')
}
