import type { MetricsResult } from '@systemfsoftware/stryker-js/Metrics'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'

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
    drawTableBody(columns, metricsResult, options).join(EOL),
    drawLineRow(columns),
  ].join(EOL)
}
