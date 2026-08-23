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
): number => {
  return Math.max(
    valueFactory(row, ancestorCount).length,
    ...row.childResults.map((child) => determineContentWidth(child, valueFactory, ancestorCount + 1)),
  )
}

abstract class Column {
  constructor(
    protected readonly header: string,
    public netWidth: number,
    public readonly isFirstColumn: boolean,
  ) {}

  protected pad(input = ''): string {
    return `${spaces(this.netWidth - stringWidth(input))}${this.isFirstColumn ? '' : ' '}${input} `
  }

  public drawLine(): string {
    return repeat('-', this.width)
  }

  public drawHeader() {
    return this.pad(this.header)
  }

  abstract drawTableCell(score: MetricsResult<Metrics>, ancestorCount: number): string

  get width() {
    return this.netWidth + (this.isFirstColumn ? 1 : 2)
  }
}

class SingleColumn extends Column {
  constructor(
    header: string,
    isFirstColumn: boolean,
    public valueFactory: TableCellValueFactory,
    public rows: MetricsResult<Metrics>,
  ) {
    const maxContentSize = determineContentWidth(rows, valueFactory)
    super(header, Math.max(maxContentSize, stringWidth(header)), isFirstColumn)
  }

  public drawTableCell(score: MetricsResult<Metrics>, ancestorCount: number): string {
    return this.color(score)(this.pad(this.valueFactory(score, ancestorCount)))
  }

  protected color(_score: MetricsResult<Metrics>) {
    return (input: string) => input
  }
}

class MutationScoreColumn extends SingleColumn {
  constructor(
    rows: MetricsResult<Metrics>,
    private readonly thresholds: MutationScoreThresholds,
    private readonly scoreType: 'total' | 'covered',
    private readonly allowColor: boolean,
  ) {
    super(
      scoreType,
      false,
      (row) => {
        const score = scoreType === 'total'
          ? row.metrics.mutationScore
          : row.metrics.mutationScoreBasedOnCoveredCode
        return Number.isNaN(score) ? 'n/a' : score.toFixed(2)
      },
      rows,
    )
  }
  protected override color(metricsResult: MetricsResult<Metrics>) {
    const {
      mutationScore: score,
      mutationScoreBasedOnCoveredCode: coveredScore,
    } = metricsResult.metrics
    const scoreToUse = this.scoreType === 'total' ? score : coveredScore
    if (!this.allowColor) {
      return (input: string) => input
    }
    if (Number.isNaN(scoreToUse)) {
      return ansi.grey
    } else if (scoreToUse >= this.thresholds.high) {
      return ansi.green
    } else if (scoreToUse >= this.thresholds.low) {
      return ansi.yellow
    } else {
      return ansi.red
    }
  }
}

class FileColumn extends SingleColumn {
  constructor(rows: MetricsResult<Metrics>) {
    super(
      'File',
      true,
      (row, ancestorCount) =>
        spaces(ancestorCount) +
        (ancestorCount === 0 ? FILES_ROOT_NAME : row.name),
      rows,
    )
  }
  protected override pad(input: string): string {
    return `${input}${spaces(this.width - stringWidth(input))}`
  }
}

class GroupColumn extends Column {
  columns: SingleColumn[]
  constructor(groupName: string, ...columns: SingleColumn[]) {
    const firstColumn = columns[0]
    if (firstColumn === undefined) throw new Error('a group column needs at least one column')
    const { isFirstColumn } = firstColumn
    const columnsWidth = columns.reduce((acc, cur) => acc + cur.width, 0) -
      (isFirstColumn ? 1 : 2)
    const groupNameWidth = stringWidth(groupName)
    super(groupName, Math.max(groupNameWidth, columnsWidth), isFirstColumn)
    this.columns = columns
    if (this.netWidth > columnsWidth + 1) {
      firstColumn.netWidth += this.netWidth - columnsWidth - 1
    }
  }

  drawColumnHeaders() {
    return this.columns.map((column) => column.drawHeader()).join('|')
  }

  drawColumnLines() {
    return this.columns.map((column) => column.drawLine()).join('|')
  }

  drawTableCell(score: MetricsResult<Metrics>, ancestorCount: number): string {
    return this.columns
      .map((column) => column.drawTableCell(score, ancestorCount))
      .join('|')
  }
}

export class ClearTextScoreTable {
  private readonly columns: GroupColumn[]

  constructor(
    private readonly metricsResult: MetricsResult<Metrics>,
    private readonly options: StrykerOptions,
  ) {
    const allowColor = options.clearTextReporter.allowColor
    this.columns = [
      new GroupColumn('', new FileColumn(metricsResult)),
      new GroupColumn(
        '% Mutation score',
        new MutationScoreColumn(metricsResult, options.thresholds, 'total', allowColor),
        new MutationScoreColumn(metricsResult, options.thresholds, 'covered', allowColor),
      ),
      new GroupColumn(
        '',
        new SingleColumn(
          `${options.clearTextReporter.allowEmojis ? '✅' : '#'} killed`,
          false,
          (row) => row.metrics.killed.toString(),
          metricsResult,
        ),
      ),
      new GroupColumn(
        '',
        new SingleColumn(
          `${options.clearTextReporter.allowEmojis ? '⌛️' : '#'} timeout`,
          false,
          (row) => row.metrics.timeout.toString(),
          metricsResult,
        ),
      ),
      new GroupColumn(
        '',
        new SingleColumn(
          `${options.clearTextReporter.allowEmojis ? '👽' : '#'} survived`,
          false,
          (row) => row.metrics.survived.toString(),
          metricsResult,
        ),
      ),
      new GroupColumn(
        '',
        new SingleColumn(
          `${options.clearTextReporter.allowEmojis ? '🙈' : '#'} no cov`,
          false,
          (row) => row.metrics.noCoverage.toString(),
          metricsResult,
        ),
      ),
      new GroupColumn(
        '',
        new SingleColumn(
          `${options.clearTextReporter.allowEmojis ? '💥' : '#'} errors`,
          false,
          (row) => (row.metrics.runtimeErrors + row.metrics.compileErrors).toString(),
          metricsResult,
        ),
      ),
    ]
  }

  private drawGroupHeader() {
    return this.drawRow((column) => column.drawHeader())
  }

  private drawGroupLine() {
    return this.drawRow((column) => column.drawLine())
  }
  private drawLine() {
    return this.drawRow((column) => column.drawColumnLines())
  }

  private drawColumnHeader() {
    return this.drawRow((c) => c.drawColumnHeaders())
  }

  private drawRow(toDraw: (col: GroupColumn) => string) {
    return this.columns.map(toDraw).join('|') + '|'
  }

  private drawTableBody(
    current = this.metricsResult,
    ancestorCount = 0,
  ): string[] {
    const rows: string[] = []
    if (
      !this.options.clearTextReporter.skipFull ||
      current.metrics.mutationScore !== 100
    ) {
      rows.push(this.drawRow((c) => c.drawTableCell(current, ancestorCount)))
    }
    rows.push(
      ...current.childResults.flatMap((child) => this.drawTableBody(child, ancestorCount + 1)),
    )
    return rows
  }

  public draw(): string {
    return [
      this.drawGroupLine(),
      this.drawGroupHeader(),
      this.drawColumnHeader(),
      this.drawLine(),
      this.drawTableBody().join(os.EOL),
      this.drawLine(),
    ].join(os.EOL)
  }
}
