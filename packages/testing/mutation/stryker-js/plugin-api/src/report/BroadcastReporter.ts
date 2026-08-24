import * as Effect from 'effect/Effect'
import type { MutantResult, schema } from '../core/index.js'
import type { DryRunCompletedEvent } from './DryRunCompletedEvent.js'
import type { MutationTestingPlanReadyEvent } from './MutationTestingPlanReadyEvent.js'
import type { MutationTestMetricsResult } from './MutationTestMetrics.schema.js'
import type { ReporterService } from './Reporter.js'

/** A reporter and the name it was configured under, which is what a log line needs. */
export interface NamedReporter {
  readonly name: string
  readonly reporter: ReporterService
}

/**
 * Fan every reporter event out to each configured reporter.
 *
 * One reporter failing never fails the run. That is deliberate and it is the
 * only place the decision is made: a reporter is an observer, so a broken
 * progress bar must not lose a completed mutation run. The failure is logged
 * with the reporter's name rather than swallowed.
 *
 * Every event is awaited here. The previous shape returned `void` while the
 * work continued, so the run could finish and the process exit while a
 * reporter was still writing its file.
 */
export const broadcastReporter = (
  reporters: readonly NamedReporter[],
): ReporterService => {
  const toEach = (
    event: string,
    call: (reporter: ReporterService) => Effect.Effect<void, unknown>,
  ): Effect.Effect<void> =>
    Effect.forEach(
      reporters,
      ({ name, reporter }) =>
        call(reporter).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning(`Reporter "${name}" failed handling ${event}`).pipe(
              Effect.annotateLogs('cause', cause),
            )
          ),
        ),
      { concurrency: 'unbounded', discard: true },
    )

  return {
    onDryRunCompleted: (event: DryRunCompletedEvent) => toEach('onDryRunCompleted', (r) => r.onDryRunCompleted(event)),

    onMutationTestingPlanReady: (event: MutationTestingPlanReadyEvent) =>
      toEach('onMutationTestingPlanReady', (r) => r.onMutationTestingPlanReady(event)),

    onMutantTested: (result: Readonly<MutantResult>) => toEach('onMutantTested', (r) => r.onMutantTested(result)),

    onMutationTestReportReady: (
      report: schema.MutationTestResult,
      metrics: Readonly<MutationTestMetricsResult>,
    ) => toEach('onMutationTestReportReady', (r) => r.onMutationTestReportReady(report, metrics)),

    wrapUp: toEach('wrapUp', (r) => r.wrapUp),
  }
}
