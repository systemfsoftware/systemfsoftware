import type { MutantResult } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import type {
  DryRunCompletedEvent,
  MutationTestingPlanReadyEvent,
  MutationTestMetricsResult,
  ReporterService,
} from '@systemfsoftware/stryker-js-plugin-api/report'
import { ReporterFailed } from '@systemfsoftware/stryker-js-plugin-api/report'
import * as Effect from 'effect/Effect'

type RunEvent =
  | { kind: 'plan'; total: number }
  | {
    kind: 'mutant'
    id: string
    status: string
    file: string
    location: schema.Location
    mutator: string
    replacement: string | null
    completed: number
    total: number
  }

export type RunEventSink = (event: RunEvent) => void

const ACTIONABLE_STATUSES = ['Survived', 'NoCoverage', 'Timeout', 'RuntimeError'] as const

function isActionableStatus(status: string): boolean {
  return (ACTIONABLE_STATUSES as readonly string[]).includes(status)
}

export function filterActionable(result: MutantResult): boolean {
  return isActionableStatus(result.status)
}

export function toRunEvent(
  result: MutantResult,
  completed: number,
  total: number,
): RunEvent {
  return {
    kind: 'mutant',
    id: result.id,
    status: result.status,
    file: result.fileName,
    location: result.location,
    mutator: result.mutatorName,
    replacement: result.replacement ?? null,
    completed,
    total,
  }
}

export class ProgressStreamReporter implements ReporterService {
  private total = 0
  private completed = 0

  constructor(private readonly runEventSink: RunEventSink = () => {}) {}

  public readonly onDryRunCompleted = (_event: DryRunCompletedEvent) => Effect.void

  public readonly onMutationTestingPlanReady = (event: MutationTestingPlanReadyEvent) =>
    Effect.try({
      try: () => {
        this.total = event.mutantPlans.length
        this.runEventSink({ kind: 'plan', total: this.total })
      },
      catch: (cause) =>
        new ReporterFailed({ reporterName: 'progress-stream', event: 'onMutationTestingPlanReady', cause }),
    })

  public readonly onMutantTested = (result: MutantResult) =>
    Effect.try({
      try: () => {
        this.completed += 1
        if (!isActionableStatus(result.status)) {
          return
        }
        this.runEventSink({
          kind: 'mutant',
          id: result.id,
          status: result.status,
          file: result.fileName,
          location: result.location,
          mutator: result.mutatorName,
          replacement: result.replacement ?? null,
          completed: this.completed,
          total: this.total,
        })
      },
      catch: (cause) => new ReporterFailed({ reporterName: 'progress-stream', event: 'onMutantTested', cause }),
    })

  public readonly onMutationTestReportReady = (
    _report: schema.MutationTestResult,
    _metrics: MutationTestMetricsResult,
  ) => Effect.void

  public readonly wrapUp = Effect.void
}
