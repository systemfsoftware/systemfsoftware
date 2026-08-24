import os from 'os'

import { type MutationScoreThresholds, type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'

import type { Metrics, MetricsResult } from '@systemfsoftware/stryker-js-plugin-api/report'

import { ansi } from './ansi.js'

import { stringWidth } from './render-text.js'

const FILES_ROOT_NAME = 'All files'

type TableCellValueFactory = (
  row: MetricsResult<Metrics>,
  ancestorCount: number,
) => string

const repeat = (char: string, nTimes: number) => char.repeat(nTimes > -1 ? nTimes : 0)
const spaces = (n: number) => repeat(' ', n)

const determineContentWidth = (
  row: MetricsResult<Metrics>,
  valueFactory: TableCellValueFactory,
  ancestorCount = 0,
): number =>
  Math.max(
    valueFactory(row, ancestorCount).length,
    ...row.childResults.map((child) => determineContentWidth(child, valueFactory, ancestorCount + 1)),
  )

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

const columnWidth = (column: Column): number => column.netWidth + (column.isFirstColumn ? 1 : 2)

const padColumn = (column: Column, input = ''): string => {
  if (column.kind === 'file') {
    return `${input}${spaces(columnWidth(column) - stringWidth(input))}`
  }
  return `${spaces(column.netWidth - stringWidth(input))}${column.isFirstColumn ? '' : ' '}${input} `
}

const drawLine = (column: Column): string => repeat('-', columnWidth(column))

const drawHeader = (column: Column): string => padColumn(column, column.header)

const colorFor = (column: Column, score: MetricsResult<Metrics>): (input: string) => string => {
  if (column.kind === 'mutationScore') {
    const scoreToUse = column.scoreType === 'total'
      ? score.metrics.mutationScore
      : score.metrics.mutationScoreBasedOnCoveredCode
    if (!column.allowColor) return (input: string) => input
    if (Number.isNaN(scoreToUse)) return ansi.grey
    if (scoreToUse >= column.thresholds.high) return ansi.green
    if (scoreToUse >= column.thresholds.low) return ansi.yellow
    return ansi.red
  }
  return (input: string) => input
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
  return {
    kind: 'single',
    header,
    isFirstColumn,
    netWidth: Math.max(maxContentSize, stringWidth(header)),
    valueFactory,
    rows,
  }
}

const makeFileColumn = (rows: MetricsResult<Metrics>): Column => {
  const valueFactory: TableCellValueFactory = (row, ancestorCount) =>
    spaces(ancestorCount) + (ancestorCount === 0 ? FILES_ROOT_NAME : row.name)
  const maxContentSize = determineContentWidth(rows, valueFactory)
  return {
    kind: 'file',
    header: 'File',
    isFirstColumn: true,
    netWidth: Math.max(maxContentSize, stringWidth('File')),
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
    const score = scoreType === 'total' ? row.metrics.mutationScore : row.metrics.mutationScoreBasedOnCoveredCode
    return Number.isNaN(score) ? 'n/a' : score.toFixed(2)
  }
  const maxContentSize = determineContentWidth(rows, valueFactory)
  return {
    kind: 'mutationScore',
    header: scoreType,
    isFirstColumn: false,
    netWidth: Math.max(maxContentSize, stringWidth(scoreType)),
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
  const columnsWidth = columns.reduce((acc, cur) => acc + columnWidth(cur), 0) - (isFirstColumn ? 1 : 2)
  const groupNameWidth = stringWidth(groupName)
  const netWidth = Math.max(groupNameWidth, columnsWidth)
  let nextColumns: readonly Column[] = columns
  if (netWidth > columnsWidth + 1) {
    const delta = netWidth - columnsWidth - 1
    const updatedFirst: Column = { ...first, netWidth: first.netWidth + delta }
    nextColumns = [updatedFirst, ...columns.slice(1)]
  }
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
  options: StrykerOptions,
): readonly Column[] => {
  const allowColor = options.clearTextReporter.allowColor
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
        `${options.clearTextReporter.allowEmojis ? '✅' : '#'} killed`,
        false,
        (row) => row.metrics.killed.toString(),
        metricsResult,
      ),
    ),
    makeGroupColumn(
      '',
      makeSingleColumn(
        `${options.clearTextReporter.allowEmojis ? '⌛️' : '#'} timeout`,
        false,
        (row) => row.metrics.timeout.toString(),
        metricsResult,
      ),
    ),
    makeGroupColumn(
      '',
      makeSingleColumn(
        `${options.clearTextReporter.allowEmojis ? '👽' : '#'} survived`,
        false,
        (row) => row.metrics.survived.toString(),
        metricsResult,
      ),
    ),
    makeGroupColumn(
      '',
      makeSingleColumn(
        `${options.clearTextReporter.allowEmojis ? '🙈' : '#'} no cov`,
        false,
        (row) => row.metrics.noCoverage.toString(),
        metricsResult,
      ),
    ),
    makeGroupColumn(
      '',
      makeSingleColumn(
        `${options.clearTextReporter.allowEmojis ? '💥' : '#'} errors`,
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
  options: StrykerOptions,
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

export const drawClearTextScoreTable = (
  metricsResult: MetricsResult<Metrics>,
  options: StrykerOptions,
): string => {
  const columns = createColumns(metricsResult, options)
  return [
    drawGroupLine(columns),
    drawGroupHeader(columns),
    drawColumnHeader(columns),
    drawLineRow(columns),
    drawTableBody(columns, metricsResult, options).join(os.EOL),
    drawLineRow(columns),
  ].join(os.EOL)
}
