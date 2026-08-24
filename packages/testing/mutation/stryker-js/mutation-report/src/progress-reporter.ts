import type { MutantResult } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import type {
  DryRunCompletedEvent,
  MutationTestingPlanReadyEvent,
  MutationTestMetricsResult,
  ReporterService,
} from '@systemfsoftware/stryker-js-plugin-api/report'
import { ReporterFailed } from '@systemfsoftware/stryker-js-plugin-api/report'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Ref from 'effect/Ref'

import { makeTimer } from '@systemfsoftware/stryker-js-mutation-run/timer'
import {
  isComplete,
  makeProgressBarState,
  type ProgressBarState,
  renderProgressBar,
  tickProgressBar,
} from './progress-bar.js'
import {
  emptyTally,
  getElapsedTime,
  getEtc,
  handleDryRunCompleted,
  handleMutantTested,
  handleMutationTestingPlanReady,
  makeEmptyTimer,
  type ProgressTally,
} from './progress-keeper.js'

export const makeProgressBarReporter = (params: {
  readonly out?: NodeJS.WritableStream
  readonly barFormat?: string
  readonly barOptions?: {
    readonly complete: string
    readonly incomplete: string
    readonly width: number
  }
} = {}): Effect.Effect<ReporterService> =>
  Effect.gen(function*() {
    const out = params.out ?? process.stdout
    const barFormat = params.barFormat ??
      'Mutation testing  [:bar] :percent (elapsed: :et, remaining: :etc) :tested/:mutants Mutants tested (:survived survived, :timedOut timed out)'
    const barOptions = params.barOptions ?? { complete: '=', incomplete: ' ', width: 50 }
    const initialTimer = makeEmptyTimer()
    const tallyRef = yield* Ref.make<ProgressTally>(emptyTally(initialTimer))
    const barRef = yield* Ref.make<ProgressBarState | undefined>(undefined)

    const reporter: ReporterService = {
      onDryRunCompleted: (event: DryRunCompletedEvent) =>
        Ref.update(tallyRef, (tally) => handleDryRunCompleted(tally, event)).pipe(
          Effect.mapError(
            (cause) => new ReporterFailed({ reporterName: 'progress', event: 'onDryRunCompleted', cause }),
          ),
        ),
      onMutationTestingPlanReady: (event: MutationTestingPlanReadyEvent) =>
        Effect.gen(function*() {
          const timer = yield* makeTimer
          yield* Ref.update(tallyRef, (tally) => handleMutationTestingPlanReady(tally, event, timer))
          const tally = yield* Ref.get(tallyRef)
          const barState = makeProgressBarState(barFormat, {
            complete: barOptions.complete,
            incomplete: barOptions.incomplete,
            total: tally.total,
            width: barOptions.width,
          })
          yield* Ref.set(barRef, barState)
        }).pipe(
          Effect.mapError(
            (cause) => new ReporterFailed({ reporterName: 'progress', event: 'onMutationTestingPlanReady', cause }),
          ),
        ),

      onMutantTested: (result: MutantResult) =>
        Effect.gen(function*() {
          const now = yield* Clock.currentTimeMillis
          const tally = yield* Ref.get(tallyRef)
          const { tally: nextTally, ticks } = handleMutantTested(tally, result)
          yield* Ref.set(tallyRef, nextTally)
          const barState = yield* Ref.get(barRef)
          if (barState === undefined) return
          const nextBar = ticks !== 0 ? tickProgressBar(barState, ticks) : barState
          yield* Ref.set(barRef, nextBar)
          const data: Record<string, string | number> = {
            survived: nextTally.survived,
            timedOut: nextTally.timedOut,
            tested: nextTally.tested,
            mutants: nextTally.mutants,
            total: nextTally.total,
            ticks: nextTally.ticks,
            et: getElapsedTime(nextTally, now),
            etc: getEtc(nextTally, now),
          }
          const line = renderProgressBar(nextBar, data)
          yield* Effect.sync(() => {
            out.write(`\r${line}`)
            if (isComplete(nextBar)) {
              out.write('\n')
            }
          })
        }).pipe(
          Effect.mapError(
            (cause) => new ReporterFailed({ reporterName: 'progress', event: 'onMutantTested', cause }),
          ),
        ),

      onMutationTestReportReady: (
        _report: schema.MutationTestResult,
        _metrics: MutationTestMetricsResult,
      ) => Effect.void,

      wrapUp: Effect.void,
    }

    return reporter
  })
