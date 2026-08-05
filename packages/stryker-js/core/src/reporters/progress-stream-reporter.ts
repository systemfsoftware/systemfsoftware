import { randomUUID } from 'node:crypto'

import { MutantResult, MutantStatus, schema } from '@stryker-mutator/api/core'
import { MutationTestingPlanReadyEvent, Reporter } from '@stryker-mutator/api/report'
import { MutationTestMetricsResult } from 'mutation-testing-metrics'

import { OutputMode, resolveMode } from '../output-mode.js'

/**
 * One newline-delimited JSON object on stderr, per the progress stream
 * contract (R17). Each line is self-contained: a line-by-line consumer
 * never has to buffer the stream to parse a line.
 */
export type ProgressStreamLine =
  | { readonly kind: 'plan'; readonly total: number; readonly runId: string }
  | {
    readonly kind: 'mutant'
    readonly id: string
    readonly status: MutantStatus
    readonly file: string
    readonly location: schema.Location
    readonly completed: number
    readonly total: number
  }
  | { readonly kind: 'done'; readonly score: number | null; readonly reportFile: string | null }

export interface ProgressStreamReporterOptions {
  /**
   * The run identifier, shared with the verdict envelope (U4). The cli layer
   * (U6) constructs this reporter with the same value the envelope carries.
   */
  readonly runId: string
  /**
   * Output mode gate. Defaults to the run's resolved mode (U3 precedence),
   * detected once at construction from the same inputs the broadcast
   * reporter uses — never a second probe at each event.
   */
  readonly mode?: OutputMode
  /** The mutation report file path, for the `done` line. `null` when the run writes no report file. */
  readonly reportFile?: string | null
}

/**
 * U7 — progress stream on stderr (R17).
 *
 * A machine-mode run streams one newline-delimited JSON object per event to
 * stderr so a caller watching a long run sees it advance instead of going
 * silent; in human mode the reporter is inert. It rides the existing
 * per-mutant event seam (`onMutantTested` / `onMutationTestingPlanReady`),
 * and registers as the fifth surviving reporter name — U9 must not prune it.
 *
 * Writes go straight to `process.stderr.write`, never `Console.error`: the
 * framework `Console` override (U6) captures Console calls, and the progress
 * stream must not be captured.
 */
export class ProgressStreamReporter implements Reporter {
  private readonly enabled: boolean
  private readonly runId: string
  private readonly reportFile: string | null
  private total = 0
  private completed = 0

  constructor(options: ProgressStreamReporterOptions = { runId: randomUUID() }) {
    this.runId = options.runId
    this.enabled = (options.mode ?? detectMode()) === 'machine'
    this.reportFile = options.reportFile ?? null
  }

  public onMutationTestingPlanReady(event: MutationTestingPlanReadyEvent): void {
    this.total = event.mutantPlans.length
    this.writeLine({ kind: 'plan', total: this.total, runId: this.runId })
  }

  public onMutantTested(result: MutantResult): void {
    this.completed += 1
    this.writeLine({
      kind: 'mutant',
      id: result.id,
      status: result.status,
      file: result.fileName,
      location: result.location,
      completed: this.completed,
      total: this.total,
    })
  }

  public onMutationTestReportReady(
    _report: Readonly<schema.MutationTestResult>,
    metrics: Readonly<MutationTestMetricsResult>,
  ): void {
    this.writeLine({
      kind: 'done',
      score: metrics.systemUnderTestMetrics.metrics.mutationScore,
      reportFile: this.reportFile,
    })
  }

  /**
   * The single choke point every line funnels through, so the human-mode
   * gate cannot be missed by a future event handler.
   */
  private writeLine(line: ProgressStreamLine): void {
    if (!this.enabled) {
      return
    }
    process.stderr.write(`${JSON.stringify(line)}\n`)
  }
}

/**
 * The run's resolved output mode, detected once at construction with the
 * same precedence and inputs as the broadcast reporter (U3).
 */
function detectMode(): OutputMode {
  return resolveMode({
    stdoutIsTTY: process.stdout.isTTY === true,
    envMode: process.env['STRYKER_MODE'],
    agent: process.env['AGENT'],
    toolVars: {
      CLAUDECODE: process.env['CLAUDECODE'],
      CODEX_SANDBOX: process.env['CODEX_SANDBOX'],
    },
  }).mode
}
