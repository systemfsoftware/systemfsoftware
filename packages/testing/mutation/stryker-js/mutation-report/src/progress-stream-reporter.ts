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
import * as Ref from 'effect/Ref'

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

export const makeProgressStreamReporter = (
  runEventSink: RunEventSink = () => {},
): Effect.Effect<ReporterService> =>
  Effect.gen(function*() {
    const totalRef = yield* Ref.make(0)
    const completedRef = yield* Ref.make(0)

    const reporter: ReporterService = {
      onDryRunCompleted: (_event: DryRunCompletedEvent) => Effect.void,

      onMutationTestingPlanReady: (event: MutationTestingPlanReadyEvent) =>
        Effect.gen(function*() {
          const total = event.mutantPlans.length
          yield* Ref.set(totalRef, total)
          yield* Effect.try({
            try: () => {
              runEventSink({ kind: 'plan', total })
            },
            catch: (cause) =>
              new ReporterFailed({ reporterName: 'progress-stream', event: 'onMutationTestingPlanReady', cause }),
          })
        }),

      onMutantTested: (result: MutantResult) =>
        Effect.gen(function*() {
          const completed = yield* Ref.updateAndGet(completedRef, (n) => n + 1)
          if (!isActionableStatus(result.status)) {
            return
          }
          const total = yield* Ref.get(totalRef)
          yield* Effect.try({
            try: () => {
              runEventSink({
                kind: 'mutant',
                id: result.id,
                status: result.status,
                file: result.fileName,
                location: result.location,
                mutator: result.mutatorName,
                replacement: result.replacement ?? null,
                completed,
                total,
              })
            },
            catch: (cause) => new ReporterFailed({ reporterName: 'progress-stream', event: 'onMutantTested', cause }),
          })
        }),

      onMutationTestReportReady: (
        _report: schema.MutationTestResult,
        _metrics: MutationTestMetricsResult,
      ) => Effect.void,

      wrapUp: Effect.void,
    }

    return reporter
  })
