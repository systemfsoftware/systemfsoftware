import type { StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import type { MetricsResult } from '@systemfsoftware/stryker-js/Report'
import * as Match from 'effect/Match'

import { ansi } from './Reporter.ansi.js'

type ProvidedStrykerOptions = StrykerOptions

const KNOWN_EMOJI: Record<string, true> = {
  '✅': true,
  '🙈': true,
  '🤥': true,
  '👽': true,
  '⏰': true,
  '⌛': true,
  '💥': true,
}

const charWidth = (char: string): number =>
  Match.value(char).pipe(
    Match.when((candidate) => KNOWN_EMOJI[candidate] === true, () => 2),
    Match.when((candidate) => (candidate.codePointAt(0) ?? 0) > 0xffff, () => 2),
    Match.orElse(() => 1),
  )

function stringWidth(input: string): number {
  return Array.from(input).reduce((width, char) => width + charWidth(char), 0)
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

const widthOrZero = (width: number): number =>
  Match.value(width === Number.NEGATIVE_INFINITY).pipe(
    Match.when(true, () => 0),
    Match.when(false, () => width),
    Match.exhaustive,
  )

const determineContentWidth = (
  row: MetricsResult,
  valueFactory: TableCellValueFactory,
  ancestorCount = 0,
): number => {
  const head = valueFactory(row, ancestorCount).length
  const childWidths = row.childResults.map((child) => determineContentWidth(child, valueFactory, ancestorCount + 1))
  return widthOrZero(maxOf([head, ...childWidths]))
}

type Column =
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

const padColumn = (column: Column, input: string): string =>
  Match.value(column.kind === 'file').pipe(
    Match.when(true, () => `${input}${spaces(columnWidth(column) - stringWidth(input))}`),
    Match.when(false, () =>
      Match.value(column.isFirstColumn).pipe(
        Match.when(true, () => `${spaces(column.netWidth - stringWidth(input))}${input} `),
        Match.when(false, () => `${spaces(column.netWidth - stringWidth(input))} ${input} `),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const drawLine = (column: Column): string => repeat('-', columnWidth(column))

const drawHeader = (column: Column): string => padColumn(column, column.header)

type MutationScoreColumn = Extract<Column, { readonly kind: 'mutationScore' }>

const mutationScoreOf = (scoreType: 'total' | 'covered', metrics: MetricsResult['metrics']): number =>
  Match.value(scoreType).pipe(
    Match.when('total', () => metrics.mutationScore),
    Match.when('covered', () => metrics.mutationScoreBasedOnCoveredCode),
    Match.exhaustive,
  )

const thresholdColor = (thresholds: MutationScoreThresholds, value: number): (input: string) => string =>
  Match.value(value).pipe(
    Match.when((present: number) => Number.isNaN(present), () => ansi.grey),
    Match.when((present) => present >= thresholds.high, () => ansi.green),
    Match.when((present) => present >= thresholds.low, () => ansi.yellow),
    Match.orElse(() => ansi.red),
  )

const scoreColor = (column: MutationScoreColumn, score: MetricsResult): (input: string) => string =>
  Match.value(column.allowColor).pipe(
    Match.when(true, () => thresholdColor(column.thresholds, mutationScoreOf(column.scoreType, score.metrics))),
    Match.when(false, () => (input: string): string => input),
    Match.exhaustive,
  )

const colorFor = (column: Column, score: MetricsResult): (input: string) => string =>
  Match.value(column).pipe(
    Match.discriminator('kind')('mutationScore', (scored) => scoreColor(scored, score)),
    Match.orElse(() => (input: string): string => input),
  )

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
  const netWidth = maxOf([maxContentSize, stringWidth(header)])
  return {
    kind: 'single',
    header,
    isFirstColumn,
    netWidth: widthOrZero(netWidth),
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
  const netWidth = maxOf([determineContentWidth(rows, valueFactory), stringWidth('File')])
  return {
    kind: 'file',
    header: 'File',
    isFirstColumn: true,
    netWidth: widthOrZero(netWidth),
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
  const valueFactory: TableCellValueFactory = (row) =>
    Match.value(mutationScoreOf(scoreType, row.metrics)).pipe(
      Match.when((present: number) => Number.isNaN(present), () => 'n/a'),
      Match.orElse((present) => present.toFixed(2)),
    )
  const netWidth = maxOf([determineContentWidth(rows, valueFactory), stringWidth(scoreType)])
  return {
    kind: 'mutationScore',
    header: scoreType,
    isFirstColumn: false,
    netWidth: widthOrZero(netWidth),
    valueFactory,
    rows,
    thresholds,
    scoreType,
    allowColor,
  }
}

const paddingWidth = (isFirstColumn: boolean): number =>
  Match.value(isFirstColumn).pipe(
    Match.when(true, () => 1),
    Match.when(false, () => 2),
    Match.exhaustive,
  )

const widthAdjustedColumns = (
  columns: readonly Column[],
  first: Column,
  columnsWidth: number,
  netWidth: number,
): readonly Column[] =>
  Match.value(netWidth > columnsWidth + 1).pipe(
    Match.when(true, () => [
      { ...first, netWidth: first.netWidth + (netWidth - columnsWidth - 1) },
      ...columns.slice(1),
    ]),
    Match.when(false, () => columns),
    Match.exhaustive,
  )

const makeGroupColumn = (groupName: string, ...columns: readonly Column[]): Column => {
  const [first, ...rest] = columns
  if (first === undefined) throw new Error('a group column needs at least one column')
  const columnsWidth = rest.reduce((acc, cur) => acc + columnWidth(cur), columnWidth(first)) -
    paddingWidth(first.isFirstColumn)
  const netWidth = widthOrZero(maxOf([stringWidth(groupName), columnsWidth]))
  return {
    kind: 'group',
    header: groupName,
    isFirstColumn: first.isFirstColumn,
    netWidth,
    columns: widthAdjustedColumns(columns, first, columnsWidth, netWidth),
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
  options: ProvidedStrykerOptions,
  current: MetricsResult,
  ancestorCount: number,
): readonly string[] => {
  const ownRow = Match.value(options.clearTextReporter.skipFull === false || current.metrics.mutationScore !== 100)
    .pipe(
      Match.when(true, () => [drawRow(columns, (column) => drawTableCell(column, current, ancestorCount))]),
      Match.when(false, (): readonly string[] => []),
      Match.exhaustive,
    )
  const childRows = current.childResults.flatMap((child) => drawTableBody(columns, options, child, ancestorCount + 1))
  return [...ownRow, ...childRows]
}

const EOL = '\n'

export const drawMutationScoreTable = (
  metricsResult: MetricsResult,
  options: ProvidedStrykerOptions,
): string => {
  const columns = createColumns(metricsResult, options)
  return [
    drawGroupLine(columns),
    drawGroupHeader(columns),
    drawColumnHeader(columns),
    drawLineRow(columns),
    drawTableBody(columns, options, metricsResult, 0).join(EOL),
    drawLineRow(columns),
  ].join(EOL)
}
