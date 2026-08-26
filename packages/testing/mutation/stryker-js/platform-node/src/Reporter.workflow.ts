import { Workflow } from '@systemfsoftware/effect-cell-types'
import type { Position } from '@systemfsoftware/stryker-js/Mutant'
import type { Metrics, MetricsResult, MutationTestMetricsResult } from '@systemfsoftware/stryker-js/Reporter'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import type * as schema from 'mutation-testing-report-schema/api'

type ProvidedStrykerOptions = StrykerOptions

const isMutationTestResult = (_value: unknown): _value is schema.MutationTestResult => true
const isMutationTestMetricsResult = (_value: unknown): _value is MutationTestMetricsResult => true
const isStrykerOptions = (_value: unknown): _value is StrykerOptions => true

const MutationTestResultSchema = S.declare(isMutationTestResult)
const MutationTestMetricsResultSchema = S.declare(isMutationTestMetricsResult)
const StrykerOptionsSchema = S.declare(isStrykerOptions)

export class ClearTextReportCommand extends S.TaggedClass<ClearTextReportCommand>()('ClearTextReportCommand', {
  report: MutationTestResultSchema,
  metrics: MutationTestMetricsResultSchema,
  options: StrykerOptionsSchema,
}) {}

export class ClearTextDocument extends S.TaggedClass<ClearTextDocument>()('ClearTextDocument', {
  stdout: S.Array(S.String),
  debug: S.Array(S.String),
}) {}

export class ClearTextReportError extends S.TaggedError<ClearTextReportError>()('ClearTextReportError', {
  message: S.String,
}) {}

// ─── ansi ────────────────────────────────────────────────────────────────

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

const ansi = {
  wrap,
  red: (text: string): string => wrap('red', text),
  green: (text: string): string => wrap('green', text),
  yellow: (text: string): string => wrap('yellow', text),
  grey: (text: string): string => wrap('grey', text),
  cyan: (text: string): string => wrap('cyan', text),
  greenBright: (text: string): string => wrap('greenBright', text),
  redBright: (text: string): string => wrap('redBright', text),
  blueBright: (text: string): string => wrap('blueBright', text),
}

// ─── render-text ───────────────────────────────────────────────────────

const KNOWN_EMOJI: Record<string, true> = {
  '✅': true,
  '🙈': true,
  '🤥': true,
  '👽': true,
  '⏰': true,
  '⌛': true,
  '💥': true,
}

export function plural(items: number): string {
  if (items > 1) {
    return 's'
  } else {
    return ''
  }
}

export function getEmojiForStatus(status: schema.MutantStatus): string {
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

export function stringWidth(input: string): number {
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

// ─── clear-text score table ────────────────────────────────────────────

type MutationScoreThresholds = ProvidedStrykerOptions['thresholds']

const FILES_ROOT_NAME = 'All files'

type TableCellValueFactory = (
  row: MetricsResult<Metrics>,
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
  row: MetricsResult<Metrics>,
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
    readonly rows: MetricsResult<Metrics>
  }
  | {
    readonly kind: 'file'
    readonly header: string
    readonly isFirstColumn: true
    readonly netWidth: number
    readonly valueFactory: TableCellValueFactory
    readonly rows: MetricsResult<Metrics>
  }
  | {
    readonly kind: 'mutationScore'
    readonly header: string
    readonly isFirstColumn: false
    readonly netWidth: number
    readonly valueFactory: TableCellValueFactory
    readonly rows: MetricsResult<Metrics>
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

const colorFor = (column: Column, score: MetricsResult<Metrics>): (input: string) => string => {
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
  score: MetricsResult<Metrics>,
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
  rows: MetricsResult<Metrics>,
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

const makeFileColumn = (rows: MetricsResult<Metrics>): Column => {
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
  rows: MetricsResult<Metrics>,
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
  metricsResult: MetricsResult<Metrics>,
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
  metricsResult: MetricsResult<Metrics>,
  options: ProvidedStrykerOptions,
  current: MetricsResult<Metrics> = metricsResult,
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

export const drawClearTextScoreTable = (
  metricsResult: MetricsResult<Metrics>,
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

// ─── clear-text render ─────────────────────────────────────────────────

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
  metrics: MutationTestMetricsResult,
  options: ProvidedStrykerOptions,
): string | undefined {
  const shouldDraw = options.clearTextReporter.reportScoreTable &&
    (!options.clearTextReporter.skipFull ||
      metrics.systemUnderTestMetrics.childResults.some((x) => x.metrics.mutationScore !== 100))
  if (!shouldDraw) return undefined
  return drawClearTextScoreTable(metrics.systemUnderTestMetrics, options)
}

export function renderClearText(
  report: schema.MutationTestResult,
  metrics: MutationTestMetricsResult,
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
    const total = metrics.systemUnderTestMetrics.metrics.totalMutants
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

export function renderClearTextString(
  report: schema.MutationTestResult,
  metrics: MutationTestMetricsResult,
  options: ProvidedStrykerOptions,
): string {
  const { stdout } = renderClearText(report, metrics, options)
  return stdout.join('\n')
}

export function buildJsonReport(report: schema.MutationTestResult): string {
  return JSON.stringify(report, null, 0)
}

// ─── workflow ─────────────────────────────────────────────────────────

export const makeClearTextDocument = Workflow.make(
  ClearTextReportCommand,
  (command: ClearTextReportCommand): Result.Result<ClearTextDocument, ClearTextReportError> => {
    const { stdout, debug } = renderClearText(command.report, command.metrics, command.options)
    return Result.succeed(ClearTextDocument.make({ stdout: [...stdout], debug: [...debug] }))
  },
)

// ─── ansi re-export for score table consumers ──────────────────────────

export { ansi }
export type { AnsiColor as Color }

export function colorEnabled(enabled: boolean, color: AnsiColor, text: string): string {
  if (enabled) {
    return wrap(color, text)
  }
  return text
}
