import type { MetricsResult } from '@systemfsoftware/stryker-js/Metrics'
import type { Position } from '@systemfsoftware/stryker-js/Mutant'
import { errorToString } from '@systemfsoftware/stryker-js/Mutant'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import type { ReporterEvent, ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'
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

interface ReportMutantEntry {
  readonly fileName: string
  readonly mutant: ReportMutant
  readonly source: string | undefined
}

type ReportChannel = 'stdout' | 'debug' | 'none'

/**
 * Where a mutant's block is written: the diagnostics channel for mutants that
 * failed to run, the report for the ones that inform, and nowhere for the rest.
 */
const REPORT_CHANNEL: Record<schema.MutantStatus, ReportChannel> = {
  Killed: 'debug',
  Timeout: 'debug',
  RuntimeError: 'debug',
  CompileError: 'debug',
  Survived: 'stdout',
  NoCoverage: 'stdout',
  Ignored: 'none',
  Pending: 'none',
}

function extractReportMutants(report: schema.MutationTestResult): ReportMutantEntry[] {
  if (!Predicate.hasProperty(report, 'files')) return []
  return Object.entries(report.files).flatMap(([fileName, file]) =>
    file.mutants.map((mutant) => ({ fileName, mutant: { ...mutant, fileName }, source: file.source }))
  )
}

function sourceLine(source: string, position: Position): string {
  const raw = source.split('\n')[position.line - 1]
  if (raw === undefined) return ''
  return raw
}

function tailFromColumn(raw: string, column: number): string[] {
  if (raw.length === 0) return []
  return [raw.slice(column)]
}

function sliceSource(source: string | undefined, position: Position): string[] {
  if (source === undefined) return []
  return tailFromColumn(sourceLine(source, position), position.column)
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

const logsCoveredTests = (
  mutant: ReportMutant,
  options: ProvidedStrykerOptions,
): mutant is ReportMutant & { readonly coveredBy: readonly string[] } => {
  if (!options.clearTextReporter.logTests) return false
  return mutant.coveredBy !== undefined
}

const coveredTestsTail = (mutant: ReportMutant, options: ProvidedStrykerOptions): readonly string[] => {
  if (!logsCoveredTests(mutant, options)) return []
  return formatCoveredTests(mutant.coveredBy, options)
}

const survivorTail = (mutant: ReportMutant, options: ProvidedStrykerOptions): readonly string[] => {
  if (mutant.static === true) return ['Ran all tests for this mutant.']
  return coveredTestsTail(mutant, options)
}

const killedByLine = (killer: string | undefined): readonly string[] => {
  if (killer === undefined) return []
  return [`Killed by: ${killer}`]
}

const killerTail = (mutant: ReportMutant): readonly string[] => {
  const killedBy = mutant.killedBy
  if (killedBy === undefined) return []
  return killedByLine(killedBy[0])
}

const statusReasonTail = (mutant: ReportMutant): readonly string[] => {
  if (mutant.statusReason === undefined) return []
  return [`Error message: ${mutant.statusReason}`]
}

/**
 * The lines below a mutant block: one tail per status, chosen by the status the
 * mutant settled at.
 */
const statusTail = (mutant: ReportMutant, options: ProvidedStrykerOptions): readonly string[] =>
  Match.value(mutant.status).pipe(
    Match.when('Survived', () => survivorTail(mutant, options)),
    Match.when('Killed', () => killerTail(mutant)),
    Match.whenOr('RuntimeError', 'CompileError', () => statusReasonTail(mutant)),
    Match.orElse((): readonly string[] => []),
  )

const overflowNotice = (hidden: number): readonly string[] => {
  if (hidden <= 0) return []
  return [`  and ${hidden} more test${plural(hidden)}!`]
}

function formatCoveredTests(tests: readonly string[], options: ProvidedStrykerOptions): string[] {
  const maxLog = options.clearTextReporter.maxTestsToLog
  const logged = Math.min(maxLog, tests.length)
  if (logged <= 0) return []
  return [
    'Tests ran:',
    ...tests.slice(0, logged).map((test) => `    ${test}`),
    ...overflowNotice(tests.length - maxLog),
    '',
  ]
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

interface ReportBlocks {
  readonly stdout: readonly string[]
  readonly debug: readonly string[]
  readonly totalTests: number
}

const linesForChannel = (
  entries: readonly ReportMutantEntry[],
  channel: ReportChannel,
  options: ProvidedStrykerOptions,
): readonly string[] => {
  const reported = entries.filter((entry) => REPORT_CHANNEL[entry.mutant.status] === channel)
  return reported.flatMap((entry) => mutantBlock(entry.fileName, entry.mutant, entry.source, options))
}

function collectMutants(report: schema.MutationTestResult, options: ProvidedStrykerOptions): ReportBlocks {
  const entries = extractReportMutants(report)
  return {
    stdout: linesForChannel(entries, 'stdout', options),
    debug: linesForChannel(entries, 'debug', options),
    totalTests: entries.reduce((total, entry) => total + (entry.mutant.testsCompleted ?? 0), 0),
  }
}

const partialScoresVisible = (metrics: MetricsResult, options: ProvidedStrykerOptions): boolean => {
  if (!options.clearTextReporter.skipFull) return true
  return metrics.childResults.some((child) => child.metrics.mutationScore !== 100)
}

const drawsScoreTable = (metrics: MetricsResult, options: ProvidedStrykerOptions): boolean => {
  if (!options.clearTextReporter.reportScoreTable) return false
  return partialScoresVisible(metrics, options)
}

function scoreTable(metrics: MetricsResult, options: ProvidedStrykerOptions): string | undefined {
  if (!drawsScoreTable(metrics, options)) return undefined
  return drawMutationScoreTable(metrics, options)
}

interface ReportLines {
  readonly stdout: readonly string[]
  readonly debug: readonly string[]
}

const EMPTY_REPORT_LINES: ReportLines = { stdout: [], debug: [] }

const testsPerMutant = (metrics: MetricsResult, totalTests: number): string => {
  const total = metrics.metrics.totalMutants
  if (total === 0) return '0.00'
  return (totalTests / total).toFixed(2)
}

const lineIfPresent = (line: string | undefined): readonly string[] => {
  if (line === undefined) return []
  return [line]
}

const mutantReportSection = (
  report: schema.MutationTestResult,
  metrics: MetricsResult,
  options: ProvidedStrykerOptions,
): ReportLines => {
  if (!options.clearTextReporter.reportMutants) return EMPTY_REPORT_LINES
  const blocks = collectMutants(report, options)
  return {
    stdout: [
      '',
      ...blocks.stdout,
      `Ran ${testsPerMutant(metrics, blocks.totalTests)} tests per mutant on average.`,
    ],
    debug: blocks.debug,
  }
}

export function renderClearText(
  report: schema.MutationTestResult,
  metrics: MetricsResult,
  options: ProvidedStrykerOptions,
): { stdout: string[]; debug: string[] } {
  const section = mutantReportSection(report, metrics, options)
  return {
    stdout: ['', ...section.stdout, ...lineIfPresent(scoreTable(metrics, options))],
    debug: [...section.debug],
  }
}

interface TerminalReport {
  readonly report: schema.MutationTestResult
  readonly metrics: MetricsResult
}

interface WatchedReports {
  terminal?: TerminalReport
}

const rememberTerminalReport = (seen: WatchedReports, event: ReporterEvent): void => {
  Match.value(event).pipe(
    Match.tag('mutationTestReportReady', (ready) => {
      seen.terminal = { report: ready.report, metrics: ready.metrics }
    }),
    Match.orElse(() => undefined),
  )
}

const lastTerminalReport = async (events: AsyncIterable<ReporterEvent>): Promise<TerminalReport | undefined> => {
  const seen: WatchedReports = {}
  for await (const event of events) {
    rememberTerminalReport(seen, event)
  }
  return seen.terminal
}

const decodeClearTextReport = (terminal: TerminalReport): ClearTextReportCommand => {
  const decoded = S.decodeUnknownResult(ClearTextReportCommand)({
    _tag: 'ClearTextReportCommand',
    report: terminal.report,
    metrics: terminal.metrics,
  })
  if (Result.isFailure(decoded)) {
    throw new ReporterFailed({
      reporterName: 'clear-text',
      event: 'mutationTestReportReady',
      cause: errorToString(decoded.failure),
    })
  }
  return decoded.success
}

interface LineSink {
  write(chunk: string): unknown
}

const writeLines = (sink: LineSink, lines: readonly string[]): void => {
  for (const line of lines) {
    sink.write(`${line}\n`)
  }
}

const writeRenderedReport = (rendered: ReportLines, options: ProvidedStrykerOptions): void => {
  writeLines(process.stdout, rendered.stdout)
  if (options.logLevel === 'debug') {
    writeLines(process.stderr, rendered.debug)
  }
}

export const makeClearTextReporter: ReporterFactory = (options) => async (events) => {
  const terminal = await lastTerminalReport(events)
  if (terminal === undefined) {
    return
  }
  const command = decodeClearTextReport(terminal)
  writeRenderedReport(renderClearText(command.report, command.metrics, options), options)
}
