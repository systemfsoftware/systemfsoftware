import { type CheckResult, type PassedCheckResult } from '@systemfsoftware/stryker-js/Checker'
import { calculateMetrics } from '@systemfsoftware/stryker-js/Metrics'
import type { MetricsResult } from '@systemfsoftware/stryker-js/Metrics'
import type { MutantResult, MutantTestCoverage, Position } from '@systemfsoftware/stryker-js/Mutant'
import { errorToString } from '@systemfsoftware/stryker-js/Mutant'
import type { AnyPluginContribution, PluginKind } from '@systemfsoftware/stryker-js/Plugin'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import type { ReporterFactory, RunTiming } from '@systemfsoftware/stryker-js/Reporter'
import { ReporterFailed } from '@systemfsoftware/stryker-js/Reporter'
import { RunEvents, VerdictReached } from '@systemfsoftware/stryker-js/Run'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import type { MutantRunResult } from '@systemfsoftware/stryker-js/TestRunner'
import type { TestRunnerCapabilities } from '@systemfsoftware/stryker-js/TestRunner'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Predicate from 'effect/Predicate'
import * as Queue from 'effect/Queue'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import type { ExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import { highestExitClass, verdictExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import { checkStatusToMutantStatus, mapRunResult, toSchemaLocation } from './mutant-result-mapping.js'
import type { TestCoverage } from './Mutants.js'
import type { ResolvedMode } from './output-mode.js'
import type { Project } from './Project.js'
import { FILE_CONCURRENCY, readOriginal } from './Project.js'
import { determineLanguage, reportFileName } from './report-assembly.js'
import { assembleFileResults, assembleTestFiles, testIdRemap } from './report-assembly.js'
import { ansi } from './Reporter.ansi.js'
import { ClearTextReportCommand } from './Reporter.schema.js'
import type { ReporterStage } from './ReporterStream.js'
import { closeReporterStage, offerTerminalReport, terminalDrainClass } from './ReporterStream.js'
import type { RunOutcome } from './Run.js'
import { strykerVersion } from './stryker-package.js'
import { buildVerdictEnvelope } from './verdict-envelope.js'
type ProvidedStrykerOptions = StrykerOptions

export type ProgressBarState = {
  readonly format: string
  readonly total: number
  readonly curr: number
  readonly width: number
  readonly complete: string
  readonly incomplete: string
}

export const makeProgressBarState = (
  format: string,
  options: {
    readonly complete: string
    readonly incomplete: string
    readonly total: number
    readonly width: number
  },
): ProgressBarState => ({
  format,
  total: options.total,
  curr: 0,
  width: options.width,
  complete: options.complete,
  incomplete: options.incomplete,
})

export const tickProgressBar = (
  state: ProgressBarState,
  ticks: number,
): ProgressBarState => ({
  ...state,
  curr: state.curr + ticks,
})

export const renderProgressBar = (
  state: ProgressBarState,
  data: Readonly<Record<string, string | number>>,
): string =>
  formatBar(state.format, state.curr, state.total, data, {
    width: state.width,
    complete: state.complete,
    incomplete: state.incomplete,
  })

export const isComplete = (state: ProgressBarState): boolean => state.curr >= state.total

function formatBar(
  format: string,
  curr: number,
  total: number,
  data: Readonly<Record<string, string | number>>,
  options: { readonly width: number; readonly complete: string; readonly incomplete: string },
): string {
  let ratio = 0
  if (total !== 0) {
    ratio = Math.min(curr / total, 1)
  }
  const filled = Math.floor(ratio * options.width)
  const bar = options.complete.repeat(filled) + options.incomplete.repeat(options.width - filled)
  const percent = `${Math.floor(ratio * 100).toString().padStart(3, ' ')}%`
  let out = format
  out = out.replace(':bar', bar)
  out = out.replace(':percent', percent)
  for (const [k, v] of Object.entries(data)) {
    out = out.replaceAll(`:${k}`, String(v))
  }
  return out
}

export type ProgressTally = {
  readonly survived: number
  readonly timedOut: number
  readonly tested: number
  readonly mutants: number
  readonly total: number
  readonly ticks: number
  readonly ticksByMutantId: ReadonlyMap<string, number>
  readonly timing: RunTiming
  readonly capabilities: TestRunnerCapabilities
  readonly startedAt: number
}

export const emptyTally = (startedAt: number): ProgressTally => ({
  survived: 0,
  timedOut: 0,
  tested: 0,
  mutants: 0,
  total: 0,
  ticks: 0,
  ticksByMutantId: new Map<string, number>(),
  timing: { net: 0, overhead: 0 },
  capabilities: { reloadEnvironment: false },
  startedAt,
})

export const getElapsedTime = (tally: ProgressTally, now: number): string => {
  const elapsed = Math.floor((now - tally.startedAt) / 1000)
  return formatTime(elapsed)
}

export const getEtc = (tally: ProgressTally, now: number): string => {
  const elapsed = Math.floor((now - tally.startedAt) / 1000)
  const totalSecondsLeft = Math.floor(
    (elapsed / tally.ticks) * (tally.total - tally.ticks),
  )
  if (Number.isFinite(totalSecondsLeft) && totalSecondsLeft > 0) {
    return formatTime(totalSecondsLeft)
  }
  return 'n/a'
}

function formatTime(timeInSeconds: number): string {
  const hours = Math.floor(timeInSeconds / 3600)
  const minutes = Math.floor((timeInSeconds % 3600) / 60)
  if (hours > 0) {
    return `~${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `~${minutes}m`
  }
  return '<1m'
}

const codes = {
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  grey: '\u001b[90m',
  cyan: '\u001b[36m',
  greenBright: '\u001b[92m',
  redBright: '\u001b[91m',
  blueBright: '\u001b[94m',
} as const

type AnsiColor = keyof typeof codes

const reset = '\u001b[39m'

function wrap(color: AnsiColor, text: string): string {
  return `${codes[color]}${text}${reset}`
}

const KNOWN_EMOJI: Record<string, true> = {
  '✅': true,
  '🙈': true,
  '🤥': true,
  '👽': true,
  '⏰': true,
  '⌛': true,
  '💥': true,
}

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

function stringWidth(input: string): number {
  return Array.from(input).reduce((acc, char) => {
    if (KNOWN_EMOJI[char] === true) {
      return acc + 2
    }
    const cp = char.codePointAt(0) ?? 0
    if (cp > 0xffff) {
      return acc + 2
    }
    return acc + 1
  }, 0)
}

type MutationScoreThresholds = ProvidedStrykerOptions['thresholds']

const FILES_ROOT_NAME = 'All files'

type TableCellValueFactory = (
  row: MetricsResult,
  ancestorCount: number,
) => string

const repeat = (char: string, nTimes: number): string => {
  if (nTimes > -1) {
    return char.repeat(nTimes)
  }
  return char.repeat(0)
}
const spaces = (n: number): string => repeat(' ', n)

const statusHeader = (allowEmojis: boolean, emoji: string, label: string): string => {
  if (allowEmojis) {
    return `${emoji} ${label}`
  }
  return `# ${label}`
}

const maxOf = (values: readonly number[]): number =>
  values.reduce((acc, cur) => {
    if (cur > acc) {
      return cur
    }
    return acc
  }, Number.NEGATIVE_INFINITY)

const determineContentWidth = (
  row: MetricsResult,
  valueFactory: TableCellValueFactory,
  ancestorCount = 0,
): number => {
  const head = valueFactory(row, ancestorCount).length
  const childWidths = row.childResults.map((child) => determineContentWidth(child, valueFactory, ancestorCount + 1))
  const all = [head, ...childWidths]
  const max = maxOf(all)
  if (max === Number.NEGATIVE_INFINITY) {
    return 0
  }
  return max
}

export type Column =
  | {
    readonly kind: 'single'
    readonly header: string
    readonly isFirstColumn: boolean
    readonly netWidth: number
    readonly valueFactory: TableCellValueFactory
    readonly rows: MetricsResult
  }
  | {
    readonly kind: 'file'
    readonly header: string
    readonly isFirstColumn: true
    readonly netWidth: number
    readonly valueFactory: TableCellValueFactory
    readonly rows: MetricsResult
  }
  | {
    readonly kind: 'mutationScore'
    readonly header: string
    readonly isFirstColumn: false
    readonly netWidth: number
    readonly valueFactory: TableCellValueFactory
    readonly rows: MetricsResult
    readonly thresholds: MutationScoreThresholds
    readonly scoreType: 'total' | 'covered'
    readonly allowColor: boolean
  }
  | {
    readonly kind: 'group'
    readonly header: string
    readonly isFirstColumn: boolean
    readonly netWidth: number
    readonly columns: readonly Column[]
  }

const columnWidth = (column: Column): number => {
  if (column.isFirstColumn) {
    return column.netWidth + 1
  }
  return column.netWidth + 2
}

const padColumn = (column: Column, input = ''): string => {
  if (column.kind === 'file') {
    return `${input}${spaces(columnWidth(column) - stringWidth(input))}`
  }
  if (column.isFirstColumn) {
    return `${spaces(column.netWidth - stringWidth(input))}${input} `
  }
  return `${spaces(column.netWidth - stringWidth(input))} ${input} `
}

const drawLine = (column: Column): string => repeat('-', columnWidth(column))

const drawHeader = (column: Column): string => padColumn(column, column.header)

const colorFor = (column: Column, score: MetricsResult): (input: string) => string => {
  if (column.kind === 'mutationScore') {
    const scoreToUse = (() => {
      if (column.scoreType === 'total') {
        return score.metrics.mutationScore
      }
      return score.metrics.mutationScoreBasedOnCoveredCode
    })()
    if (!column.allowColor) return (input: string): string => input
    if (Number.isNaN(scoreToUse)) return ansi.grey
    if (scoreToUse >= column.thresholds.high) return ansi.green
    if (scoreToUse >= column.thresholds.low) return ansi.yellow
    return ansi.red
  }
  return (input: string): string => input
}

const drawTableCell = (
  column: Column,
  score: MetricsResult,
  ancestorCount: number,
): string => {
  switch (column.kind) {
    case 'group':
      return column.columns.map((c) => drawTableCell(c, score, ancestorCount)).join('|')
    case 'single':
    case 'file':
    case 'mutationScore': {
      const raw = column.valueFactory(score, ancestorCount)
      const padded = padColumn(column, raw)
      return colorFor(column, score)(padded)
    }
  }
}

const drawColumnHeaders = (column: Column): string => {
  if (column.kind !== 'group') return drawHeader(column)
  return column.columns.map((c) => drawHeader(c)).join('|')
}

const drawColumnLines = (column: Column): string => {
  if (column.kind !== 'group') return drawLine(column)
  return column.columns.map((c) => drawLine(c)).join('|')
}

const makeSingleColumn = (
  header: string,
  isFirstColumn: boolean,
  valueFactory: TableCellValueFactory,
  rows: MetricsResult,
): Column => {
  const maxContentSize = determineContentWidth(rows, valueFactory)
  const headerWidth = stringWidth(header)
  const netWidth = maxOf([maxContentSize, headerWidth])
  const finalNetWidth = (() => {
    if (netWidth === Number.NEGATIVE_INFINITY) {
      return 0
    }
    return netWidth
  })()
  return {
    kind: 'single',
    header,
    isFirstColumn,
    netWidth: finalNetWidth,
    valueFactory,
    rows,
  }
}

const makeFileColumn = (rows: MetricsResult): Column => {
  const valueFactory: TableCellValueFactory = (row, ancestorCount) => {
    if (ancestorCount === 0) {
      return spaces(ancestorCount) + FILES_ROOT_NAME
    }
    return spaces(ancestorCount) + row.name
  }
  const maxContentSize = determineContentWidth(rows, valueFactory)
  const fileWidth = stringWidth('File')
  const netWidth = maxOf([maxContentSize, fileWidth])
  const finalNetWidth = (() => {
    if (netWidth === Number.NEGATIVE_INFINITY) {
      return 0
    }
    return netWidth
  })()
  return {
    kind: 'file',
    header: 'File',
    isFirstColumn: true,
    netWidth: finalNetWidth,
    valueFactory,
    rows,
  }
}

const makeMutationScoreColumn = (
  rows: MetricsResult,
  thresholds: MutationScoreThresholds,
  scoreType: 'total' | 'covered',
  allowColor: boolean,
): Column => {
  const valueFactory: TableCellValueFactory = (row) => {
    const score = (() => {
      if (scoreType === 'total') {
        return row.metrics.mutationScore
      }
      return row.metrics.mutationScoreBasedOnCoveredCode
    })()
    if (Number.isNaN(score)) {
      return 'n/a'
    }
    return score.toFixed(2)
  }
  const maxContentSize = determineContentWidth(rows, valueFactory)
  const headerWidth = stringWidth(scoreType)
  const netWidth = maxOf([maxContentSize, headerWidth])
  const finalNetWidth = (() => {
    if (netWidth === Number.NEGATIVE_INFINITY) {
      return 0
    }
    return netWidth
  })()
  return {
    kind: 'mutationScore',
    header: scoreType,
    isFirstColumn: false,
    netWidth: finalNetWidth,
    valueFactory,
    rows,
    thresholds,
    scoreType,
    allowColor,
  }
}

const makeGroupColumn = (groupName: string, ...columns: readonly Column[]): Column => {
  if (columns.length === 0) throw new Error('a group column needs at least one column')
  const first = columns[0]
  if (first === undefined) throw new Error('a group column needs at least one column')
  const isFirstColumn = first.isFirstColumn
  const extra = (() => {
    if (isFirstColumn) {
      return 1
    }
    return 2
  })()
  const columnsWidth = columns.reduce((acc, cur) => acc + columnWidth(cur), 0) - extra
  const groupNameWidth = stringWidth(groupName)
  const rawNetWidth = maxOf([groupNameWidth, columnsWidth])
  const netWidth = (() => {
    if (rawNetWidth === Number.NEGATIVE_INFINITY) {
      return 0
    }
    return rawNetWidth
  })()
  const nextColumns = (() => {
    if (netWidth > columnsWidth + 1) {
      const delta = netWidth - columnsWidth - 1
      const updatedFirst: Column = { ...first, netWidth: first.netWidth + delta }
      return [updatedFirst, ...columns.slice(1)]
    }
    return columns
  })()
  return {
    kind: 'group',
    header: groupName,
    isFirstColumn,
    netWidth,
    columns: nextColumns,
  }
}

const createColumns = (
  metricsResult: MetricsResult,
  options: ProvidedStrykerOptions,
): readonly Column[] => {
  const allowColor = options.clearTextReporter.allowColor
  const allowEmojis = options.clearTextReporter.allowEmojis
  return [
    makeGroupColumn('', makeFileColumn(metricsResult)),
    makeGroupColumn(
      '% Mutation score',
      makeMutationScoreColumn(metricsResult, options.thresholds, 'total', allowColor),
      makeMutationScoreColumn(metricsResult, options.thresholds, 'covered', allowColor),
    ),
    makeGroupColumn(
      '',
      makeSingleColumn(
        statusHeader(allowEmojis, '✅', 'killed'),
        false,
        (row) => row.metrics.killed.toString(),
        metricsResult,
      ),
    ),
    makeGroupColumn(
      '',
      makeSingleColumn(
        statusHeader(allowEmojis, '⌛️', 'timeout'),
        false,
        (row) => row.metrics.timeout.toString(),
        metricsResult,
      ),
    ),
    makeGroupColumn(
      '',
      makeSingleColumn(
        statusHeader(allowEmojis, '👽', 'survived'),
        false,
        (row) => row.metrics.survived.toString(),
        metricsResult,
      ),
    ),
    makeGroupColumn(
      '',
      makeSingleColumn(
        statusHeader(allowEmojis, '🙈', 'no cov'),
        false,
        (row) => row.metrics.noCoverage.toString(),
        metricsResult,
      ),
    ),
    makeGroupColumn(
      '',
      makeSingleColumn(
        statusHeader(allowEmojis, '💥', 'errors'),
        false,
        (row) => (row.metrics.runtimeErrors + row.metrics.compileErrors).toString(),
        metricsResult,
      ),
    ),
  ]
}

const drawRow = (
  columns: readonly Column[],
  toDraw: (col: Column) => string,
): string => `${columns.map(toDraw).join('|')}|`

const drawGroupHeader = (columns: readonly Column[]): string => drawRow(columns, (c) => drawHeader(c))

const drawGroupLine = (columns: readonly Column[]): string => drawRow(columns, (c) => drawLine(c))

const drawLineRow = (columns: readonly Column[]): string => drawRow(columns, (c) => drawColumnLines(c))

const drawColumnHeader = (columns: readonly Column[]): string => drawRow(columns, (c) => drawColumnHeaders(c))

const drawTableBody = (
  columns: readonly Column[],
  metricsResult: MetricsResult,
  options: ProvidedStrykerOptions,
  current: MetricsResult = metricsResult,
  ancestorCount = 0,
): readonly string[] => {
  const rows: string[] = []
  if (!options.clearTextReporter.skipFull || current.metrics.mutationScore !== 100) {
    rows.push(drawRow(columns, (c) => drawTableCell(c, current, ancestorCount)))
  }
  for (const child of current.childResults) {
    rows.push(...drawTableBody(columns, metricsResult, options, child, ancestorCount + 1))
  }
  return rows
}

const EOL = '\n'

const drawClearTextScoreTable = (
  metricsResult: MetricsResult,
  options: ProvidedStrykerOptions,
): string => {
  const columns = createColumns(metricsResult, options)
  return [
    drawGroupLine(columns),
    drawGroupHeader(columns),
    drawColumnHeader(columns),
    drawLineRow(columns),
    drawTableBody(columns, metricsResult, options).join(EOL),
    drawLineRow(columns),
  ].join(EOL)
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
      return wrap('yellow', String(position.line))
    }
    return String(position.line)
  })()
  const col = (() => {
    if (allowColor) {
      return wrap('yellow', String(position.column))
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
  return drawClearTextScoreTable(metrics, options)
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

export interface JsonReporterDeps {
  readonly fileSystem: FileSystem.FileSystem
  readonly path: Path.Path
}

export const makeJsonReporter = (services: JsonReporterDeps): ReporterFactory => (options) => async (events) => {
  const seen: { report?: schema.MutationTestResult } = {}
  for await (const event of events) {
    Match.value(event).pipe(
      Match.tag('mutationTestReportReady', (ready) => {
        seen.report = ready.report
      }),
      Match.orElse(() => undefined),
    )
  }
  if (seen.report === undefined) {
    return
  }
  const json = JSON.stringify(seen.report, null, 0)
  const writeReport = Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const fileName = path.resolve(path.normalize(options.jsonReporter.fileName))
    if (options.logLevel === 'debug') {
      process.stderr.write(`Using relative path ${path.normalize(options.jsonReporter.fileName)}\n`)
    }
    const failAsJsonReporter = (cause: unknown): ReporterFailed =>
      new ReporterFailed({
        reporterName: 'json',
        event: 'mutationTestReportReady',
        cause: errorToString(cause),
      })
    yield* fs.makeDirectory(path.dirname(fileName), { recursive: true }).pipe(
      Effect.mapError(failAsJsonReporter),
    )
    yield* fs.writeFileString(fileName, json).pipe(Effect.mapError(failAsJsonReporter))
    const url = yield* path.toFileUrl(fileName).pipe(Effect.mapError(failAsJsonReporter))
    process.stdout.write(`Your report can be found at: ${url.href}\n`)
  })
  await Effect.runPromise(
    writeReport.pipe(
      Effect.provideService(FileSystem.FileSystem, services.fileSystem),
      Effect.provideService(Path.Path, services.path),
    ),
  )
}

const PROGRESS_BAR_FORMAT =
  'Mutation testing  [:bar] :percent (elapsed: :et, remaining: :etc) :tested/:mutants Mutants tested (:survived survived, :timedOut timed out)'

const PROGRESS_BAR_OPTIONS = { complete: '=', incomplete: ' ', width: 50 }

export const makeProgressBarReporter: ReporterFactory = () => async (events) => {
  const progress: { tally: ProgressTally; bar: ProgressBarState | undefined } = {
    tally: emptyTally(0),
    bar: undefined,
  }
  const render = (now: number): void => {
    if (progress.bar === undefined) {
      return
    }
    const data: Record<string, string | number> = {
      survived: progress.tally.survived,
      timedOut: progress.tally.timedOut,
      tested: progress.tally.tested,
      mutants: progress.tally.mutants,
      total: progress.tally.total,
      ticks: progress.tally.ticks,
      et: getElapsedTime(progress.tally, now),
      etc: getEtc(progress.tally, now),
    }
    const line = renderProgressBar(progress.bar, data)
    process.stdout.write(`\r${line}`)
    if (isComplete(progress.bar)) {
      process.stdout.write('\n')
    }
  }
  try {
    for await (const event of events) {
      Match.value(event).pipe(
        Match.tag('dryRunCompleted', (dryRun) => {
          progress.tally = {
            ...progress.tally,
            timing: dryRun.timing,
            capabilities: { reloadEnvironment: dryRun.capabilities.reloadEnvironment },
          }
        }),
        Match.tag('mutationTestingPlanReady', (planReady) => {
          const ticksByMutantId = new Map<string, number>()
          for (const plan of planReady.plans) {
            if (plan.plan !== 'Run') {
              continue
            }
            let ticks = plan.netTime
            if (progress.tally.capabilities.reloadEnvironment === false && plan.reloadEnvironment) {
              ticks += progress.tally.timing.overhead
            }
            ticksByMutantId.set(plan.mutantId, ticks)
          }
          let total = 0
          for (const ticks of ticksByMutantId.values()) {
            total += ticks
          }
          progress.tally = {
            ...progress.tally,
            startedAt: performance.now(),
            ticksByMutantId,
            mutants: ticksByMutantId.size,
            total,
          }
          progress.bar = makeProgressBarState(PROGRESS_BAR_FORMAT, { ...PROGRESS_BAR_OPTIONS, total })
        }),
        Match.tag('mutantTested', (tested) => {
          const ticks = progress.tally.ticksByMutantId.get(tested.id)
          if (ticks === undefined) {
            return
          }
          let survived = progress.tally.survived
          if (tested.status === 'Survived') {
            survived = progress.tally.survived + 1
          }
          let timedOut = progress.tally.timedOut
          if (tested.status === 'Timeout') {
            timedOut = progress.tally.timedOut + 1
          }
          progress.tally = {
            ...progress.tally,
            tested: tested.completed,
            ticks: progress.tally.ticks + ticks,
            survived,
            timedOut,
          }
          if (ticks !== 0 && progress.bar !== undefined) {
            progress.bar = tickProgressBar(progress.bar, ticks)
          }
          render(performance.now())
        }),
        Match.orElse(() => undefined),
      )
    }
  } finally {
    if (progress.bar !== undefined && !isComplete(progress.bar)) {
      process.stdout.write('\n')
    }
  }
}

export const makeProgressStreamReporter: ReporterFactory = () => async (events) => {
  for await (const drained of events) {
    void drained
  }
}

const STRYKER_FRAMEWORK: Readonly<Pick<schema.FrameworkInformation, 'branding' | 'name' | 'version'>> = Object.freeze({
  branding: {
    homepageUrl: 'https://stryker-mutator.io',
    imageUrl: 'https://stryker-mutator.io/assets/images/stryker-80x80.png',
  },
  name: 'StrykerJS',
  version: strykerVersion,
})

export interface MutationReportingService {
  readonly reportCheckFailure: (
    mutant: MutantTestCoverage,
    result: Exclude<CheckResult, PassedCheckResult>,
  ) => Effect.Effect<MutantResult>
  readonly reportMutantRunResult: (
    mutant: MutantTestCoverage,
    result: MutantRunResult,
  ) => Effect.Effect<MutantResult>
  readonly reportAll: (
    results: readonly MutantResult[],
  ) => Effect.Effect<RunOutcome, unknown, FileSystem.FileSystem | Path.Path | RunEvents>
  readonly checkpoint: (
    results: readonly MutantResult[],
  ) => Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path>
}

export class MutationReporting extends Context.Service<MutationReporting, MutationReportingService>()(
  'MutationReporting',
) {}

export interface MakeMutationReportingInput {
  readonly reporterStage: ReporterStage
  readonly options: StrykerOptions
  readonly project: Project
  readonly testCoverage: TestCoverage
  readonly runId: string
  readonly resolvedMode: ResolvedMode
  readonly pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>
  readonly sandboxDirectory: string
  readonly basePath: string
}

export const makeMutationReportingService = (input: MakeMutationReportingInput): MutationReportingService => {
  const reportMutantStatus = (
    mutant: MutantTestCoverage,
    status: MutantResult['status'],
  ): Effect.Effect<MutantResult> => {
    const location = toSchemaLocation(mutant.location)
    return Effect.succeed({
      _tag: 'Mutant',
      id: mutant.id,
      fileName: mutant.fileName,
      mutatorName: mutant.mutatorName,
      replacement: mutant.replacement,
      location,
      status,
      coveredBy: mutant.coveredBy,
      static: mutant.static,
      testsCompleted: mutant.testsCompleted,
      description: mutant.description,
      statusReason: mutant.statusReason,
    })
  }

  const reportCheckFailure: MutationReportingService['reportCheckFailure'] = (mutant, result) =>
    reportMutantStatus(mutant, checkStatusToMutantStatus(result.status))

  const reportMutantRunResult: MutationReportingService['reportMutantRunResult'] = (mutant, result) => {
    const mapped = mapRunResult(mutant, result)
    return Effect.succeed(mapped)
  }

  const uniqueNames = (names: readonly (string | undefined)[]): readonly string[] => {
    const seen = new Set<string>()
    const kept: string[] = []
    for (const name of names) {
      if (name === undefined || seen.has(name)) {
        continue
      }
      seen.add(name)
      kept.push(name)
    }
    return kept
  }

  const readMutatedSources = (fileNames: readonly string[]) =>
    Effect.gen(function*() {
      const entries = yield* Effect.forEach(
        fileNames,
        (fileName) =>
          Effect.gen(function*() {
            const language = determineLanguage(fileName)
            const file = MutableHashMap.get(input.project.files, fileName)
            if (Option.isNone(file)) {
              yield* Effect.logWarning(
                `File "${fileName}" not found in input files, but did receive mutant result for it. This shouldn't happen`,
              )
              const empty: schema.FileResult = { language, mutants: [], source: '' }
              return [fileName, empty] as const
            }
            const read: schema.FileResult = { language, mutants: [], source: yield* readOriginal(file.value) }
            return [fileName, read] as const
          }),
        { concurrency: FILE_CONCURRENCY },
      )
      return HashMap.fromIterable(entries)
    })

  const readTestSources = (fileNames: readonly string[]) =>
    Effect.gen(function*() {
      const entries = yield* Effect.forEach(
        fileNames,
        (fileName) =>
          Effect.gen(function*() {
            const file = MutableHashMap.get(input.project.files, fileName)
            if (Option.isNone(file)) {
              yield* Effect.logWarning(
                `Test file "${fileName}" not found in input files, but did receive test result for it. This shouldn't happen.`,
              )
              const empty: schema.TestFile = { tests: [] }
              return [fileName, empty] as const
            }
            const read: schema.TestFile = { tests: [], source: yield* readOriginal(file.value) }
            return [fileName, read] as const
          }),
        { concurrency: FILE_CONCURRENCY },
      )
      return HashMap.fromIterable(entries)
    })

  const assembleReport = (results: readonly MutantResult[]) =>
    Effect.gen(function*() {
      const pathService = yield* Path.Path
      const tests = [...MutableHashMap.values(input.testCoverage.testsById)]
      const remap = testIdRemap(tests.map((test) => test.id))
      const mutatedFileNames = uniqueNames(results.map((result) => result.fileName))
      const testFileNames = uniqueNames(tests.map((test) => test.fileName))
      const sources = yield* readMutatedSources(mutatedFileNames)
      const testSources = yield* readTestSources(testFileNames)
      const reportNames = HashMap.fromIterable(
        [...mutatedFileNames, ...testFileNames].map(
          (fileName) => [fileName, reportFileName(pathService.relative(input.basePath, fileName))] as const,
        ),
      )
      return {
        files: assembleFileResults({ sources, reportNames, mutants: results, remap }),
        testFiles: assembleTestFiles({ testSources, reportNames, tests, remap }),
      }
    })

  const mutationTestReport = (
    results: readonly MutantResult[],
  ): Effect.Effect<schema.MutationTestResult, unknown, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function*() {
      const { files, testFiles } = yield* assembleReport(results)
      const dependencies = yield* discoverDependencies()
      return {
        files,
        schemaVersion: '1.0',
        thresholds: input.options.thresholds,
        testFiles,
        projectRoot: input.basePath,
        config: input.options,
        framework: { ...STRYKER_FRAMEWORK, dependencies },
      }
    })

  const MANIFEST_SPECIFIERS = [
    '@systemfsoftware/stryker-js-vitest-runner',
    '@systemfsoftware/stryker-js-typescript-checker',
    '@systemfsoftware/stryker-plugins',
    'vitest',
    'karma',
    'karma-chai',
    'karma-chrome-launcher',
    'karma-jasmine',
    'karma-mocha',
    'mocha',
    'jasmine',
    'jasmine-core',
    'jest',
    'react-scripts',
    'typescript',
    '@angular/cli',
    'webpack',
    'webpack-cli',
    'ts-jest',
  ] as const

  const ManifestSchema = S.Struct({ version: S.optional(S.String) })

  const readManifestVersion = (
    fs: FileSystem.FileSystem,
    pathService: Path.Path,
    specifier: string,
  ): Effect.Effect<Option.Option<string>> =>
    Effect.gen(function*() {
      const resolved = yield* Effect.try(() => new URL(import.meta.resolve(`${specifier}/package.json`)))
      const manifestPath = yield* pathService.fromFileUrl(resolved)
      const text = yield* fs.readFileString(manifestPath)
      return Result.match(S.decodeUnknownResult(S.fromJsonString(ManifestSchema))(text), {
        onFailure: () => Option.none<string>(),
        onSuccess: (manifest) => Option.some(manifest.version ?? ''),
      })
    }).pipe(Effect.orElseSucceed(() => Option.none<string>()))

  const discoverDependencies = (): Effect.Effect<
    schema.Dependencies,
    never,
    FileSystem.FileSystem | Path.Path
  > =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const pathService = yield* Path.Path
      const pairs = yield* Effect.forEach(
        MANIFEST_SPECIFIERS,
        (specifier) =>
          Effect.map(readManifestVersion(fs, pathService, specifier), (version) => [specifier, version] as const),
        { concurrency: FILE_CONCURRENCY },
      )
      const found: Array<readonly [string, string]> = []
      for (const [specifier, version] of pairs) {
        if (Option.isSome(version)) {
          found.push([specifier, version.value] as const)
        }
      }
      return Object.fromEntries(found)
    })

  const determineExitCode = (
    metrics: MetricsResult,
  ): Effect.Effect<ExitClass | null> =>
    Effect.gen(function*() {
      const { mutationScore } = metrics.metrics
      const breaking = input.options.thresholds.break
      const formattedScore = mutationScore.toFixed(2)

      if (typeof breaking !== 'number') {
        yield* Effect.logDebug(
          "No breaking threshold configured. Won't fail the build no matter how low your mutation score is. Set `thresholds.break` to change this behavior.",
        )
        return null
      }

      const verdict = verdictExitClass(mutationScore, breaking)
      if (verdict === null) {
        yield* Effect.logInfo(
          `Final mutation score of ${formattedScore} is greater than or equal to break threshold ${String(breaking)}`,
        )
        return null
      }

      yield* Effect.logError(
        `Final mutation score ${formattedScore} under breaking threshold ${
          String(breaking)
        }, setting exit code to 1 (failure).`,
      )
      yield* Effect.logInfo(
        '(improve mutation score or set `thresholds.break = null` to prevent this error in the future)',
      )
      return verdict
    })
  const emitVerdict = (
    report: schema.MutationTestResult,
    pathService: Path.Path,
  ): Effect.Effect<void, never, RunEvents> =>
    Effect.gen(function*() {
      const envelope = buildVerdictEnvelope(
        report,
        input.resolvedMode.mode,
        input.resolvedMode.signal,
        input.runId,
        input.basePath,
        pathService,
      )
      const queue = yield* RunEvents
      yield* Queue.offer(
        queue,
        new VerdictReached({
          schemaVersion: envelope.schemaVersion,
          runId: envelope.runId,
          mode: envelope.mode,
          signal: envelope.signal,
          score: envelope.score,
          thresholds: envelope.thresholds,
          reportFile: envelope.reportFile,
          counts: envelope.counts,
          mutants: envelope.mutants,
        }),
      )
    })

  const reportAll: MutationReportingService['reportAll'] = (results) =>
    Effect.gen(function*() {
      const pathService = yield* Path.Path
      const report = yield* mutationTestReport(results)
      const metrics = calculateMetrics(report.files)
      yield* offerTerminalReport(input.reporterStage, report, metrics)
      const terminalDrain = terminalDrainClass(yield* closeReporterStage(input.reporterStage))
      const verdict = yield* determineExitCode(metrics)
      const finalVerdict = highestExitClass(
        [verdict, terminalDrain].filter((candidate): candidate is ExitClass => candidate !== null),
      )
      yield* emitVerdict(report, pathService)
      if (input.options.incremental) {
        const fs = yield* FileSystem.FileSystem
        const dir = pathService.dirname(input.options.incrementalFile)
        yield* fs.makeDirectory(dir, { recursive: true })
        yield* fs.writeFileString(input.options.incrementalFile, JSON.stringify(report, null, 2))
      }
      return { results, verdict: finalVerdict } satisfies RunOutcome
    })
  const writeAtomic = (file: string, content: string) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const pathService = yield* Path.Path
      yield* fs.makeDirectory(pathService.dirname(file), { recursive: true })
      const tmp = `${file}.tmp`
      yield* fs.writeFileString(tmp, content)
      yield* fs.rename(tmp, file).pipe(
        Effect.catch(() => fs.copyFile(tmp, file).pipe(Effect.andThen(fs.remove(tmp)))),
      )
    })

  const slimIncrementalReport = (results: readonly MutantResult[]) =>
    Effect.gen(function*() {
      const { files, testFiles } = yield* assembleReport(results)
      return {
        schemaVersion: '1.0',
        thresholds: input.options.thresholds,
        files,
        testFiles,
      }
    })

  const checkpoint: MutationReportingService['checkpoint'] = (results) =>
    Effect.gen(function*() {
      if (!input.options.incremental) {
        return
      }
      const report = yield* slimIncrementalReport(results)
      yield* writeAtomic(input.options.incrementalFile, JSON.stringify(report))
    })

  return {
    reportCheckFailure,
    reportMutantRunResult,
    reportAll,
    checkpoint,
  }
}

export const makeMutationReportingLayer = (input: MakeMutationReportingInput): Layer.Layer<MutationReporting> =>
  Layer.succeed(MutationReporting, makeMutationReportingService(input))
