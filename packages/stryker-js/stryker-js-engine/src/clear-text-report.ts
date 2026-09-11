import type { MetricsResult } from '@systemfsoftware/stryker-js/Metrics'
import type { Position } from '@systemfsoftware/stryker-js/Mutant'
import { errorToString } from '@systemfsoftware/stryker-js/Mutant'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import type { ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'
import { ReporterFailed } from '@systemfsoftware/stryker-js/Reporter'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import * as Match from 'effect/Match'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { drawMutationScoreTable } from './mutation-score-table.js'
import { ansi } from './Reporter.ansi.js'
import { ClearTextReportCommand } from './Reporter.schema.js'

type ProvidedStrykerOptions = StrykerOptions

function plural(items: number): string {
  if (items > 1) {
    return 's'
  } else {
    return ''
  }
}

function getEmojiForStatus(status: schema.MutantStatus): string {
  switch (status) {
    case 'Killed':
      return '✅'
    case 'NoCoverage':
      return '🙈'
    case 'Ignored':
      return '🤥'
    case 'Survived':
      return '👽'
    case 'Timeout':
      return '⏰'
    case 'Pending':
      return '⌛'
    case 'RuntimeError':
    case 'CompileError':
      return '💥'
  }
}

function sourceLocation(fileName: string, position: Position, allowColor: boolean): string {
  const file = (() => {
    if (allowColor) {
      return ansi.cyan(fileName)
    }
    return fileName
  })()
  const line = (() => {
    if (allowColor) {
      return ansi.yellow(String(position.line))
    }
    return String(position.line)
  })()
  const col = (() => {
    if (allowColor) {
      return ansi.yellow(String(position.column))
    }
    return String(position.column)
  })()
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
    const mutants: readonly schema.MutantResult[] = file.mutants
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
  return sliceSource(source, position).map((l) => {
    if (allowColor) {
      return ansi.red(`-   ${l}`)
    }
    return `-   ${l}`
  })
}

function replacementLines(replacement: string | undefined, allowColor: boolean): string[] {
  if (replacement === undefined) return []
  return replacement
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      if (allowColor) {
        return ansi.green(`+   ${l}`)
      }
      return `+   ${l}`
    })
}

function statusTail(mutant: ReportMutant, options: ProvidedStrykerOptions): string[] {
  if (mutant.status === 'Survived') {
    if (mutant.static === true) {
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
  if (
    (mutant.status === 'RuntimeError' || mutant.status === 'CompileError') &&
    mutant.statusReason !== undefined
  ) {
    return [`Error message: ${mutant.statusReason}`]
  }
  return []
}

function formatCoveredTests(tests: readonly string[], options: ProvidedStrykerOptions): string[] {
  const maxLog = options.clearTextReporter.maxTestsToLog
  const effectiveCount = (() => {
    if (maxLog < tests.length) {
      return maxLog
    }
    return tests.length
  })()
  if (effectiveCount <= 0) return []
  const out: string[] = ['Tests ran:']
  for (const t of tests.slice(0, effectiveCount)) {
    out.push(`    ${t}`)
  }
  const diff = tests.length - maxLog
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
  options: ProvidedStrykerOptions,
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
  return (
    status === 'Killed' || status === 'Timeout' || status === 'RuntimeError' || status === 'CompileError'
  )
}

function isInfoStatus(status: string): boolean {
  return status === 'Survived' || status === 'NoCoverage'
}

function collectMutants(
  report: schema.MutationTestResult,
  options: ProvidedStrykerOptions,
): { stdout: string[]; debug: string[]; totalTests: number } {
  const stdout: string[] = []
  const debug: string[] = []
  const mutants = extractReportMutants(report)
  const totalTests = mutants.reduce((acc, { mutant }) => acc + (mutant.testsCompleted ?? 0), 0)
  for (const { fileName, mutant, source } of mutants) {
    if (isDebugStatus(mutant.status)) {
      debug.push(...mutantBlock(fileName, mutant, source, options))
    } else if (isInfoStatus(mutant.status)) {
      stdout.push(...mutantBlock(fileName, mutant, source, options))
    }
  }
  return { stdout, debug, totalTests }
}

function scoreTable(
  metrics: MetricsResult,
  options: ProvidedStrykerOptions,
): string | undefined {
  const shouldDraw = options.clearTextReporter.reportScoreTable &&
    (!options.clearTextReporter.skipFull ||
      metrics.childResults.some((x) => x.metrics.mutationScore !== 100))
  if (!shouldDraw) return undefined
  return drawMutationScoreTable(metrics, options)
}

export function renderClearText(
  report: schema.MutationTestResult,
  metrics: MetricsResult,
  options: ProvidedStrykerOptions,
): { stdout: string[]; debug: string[] } {
  const stdout: string[] = []
  const debug: string[] = []
  stdout.push('')
  if (options.clearTextReporter.reportMutants) {
    stdout.push('')
    const { stdout: s, debug: d, totalTests } = collectMutants(report, options)
    stdout.push(...s)
    debug.push(...d)
    const total = metrics.metrics.totalMutants
    const avg = (() => {
      if (total !== 0) {
        return (totalTests / total).toFixed(2)
      }
      return '0.00'
    })()
    stdout.push(`Ran ${avg} tests per mutant on average.`)
  }
  const table = scoreTable(metrics, options)
  if (table !== undefined) stdout.push(table)
  return { stdout, debug }
}

export const makeClearTextReporter: ReporterFactory = (options) => async (events) => {
  const seen: {
    terminal?: { readonly report: schema.MutationTestResult; readonly metrics: MetricsResult }
  } = {}
  for await (const event of events) {
    Match.value(event).pipe(
      Match.tag('mutationTestReportReady', (ready) => {
        seen.terminal = { report: ready.report, metrics: ready.metrics }
      }),
      Match.orElse(() => undefined),
    )
  }
  if (seen.terminal === undefined) {
    return
  }
  const decoded = S.decodeUnknownResult(ClearTextReportCommand)({
    _tag: 'ClearTextReportCommand',
    report: seen.terminal.report,
    metrics: seen.terminal.metrics,
  })
  if (Result.isFailure(decoded)) {
    throw new ReporterFailed({
      reporterName: 'clear-text',
      event: 'mutationTestReportReady',
      cause: errorToString(decoded.failure),
    })
  }
  const rendered = renderClearText(decoded.success.report, decoded.success.metrics, options)
  for (const line of rendered.stdout) {
    process.stdout.write(`${line}\n`)
  }
  if (options.logLevel === 'debug') {
    for (const line of rendered.debug) {
      process.stderr.write(`${line}\n`)
    }
  }
}
