import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

import type { MutantResult, schema } from '../core/index.js'

import type { DryRunCompletedEvent } from './DryRunCompletedEvent.js'
import type { MutationTestingPlanReadyEvent } from './MutationTestingPlanReadyEvent.js'
import type { MutationTestMetricsResult } from './MutationTestMetrics.schema.js'
import type { ReporterFailed } from './ReporterFailed.schema.js'

/**
 * What a reporter does, as values rather than started work.
 *
 * Every operation returns an `Effect`, so the engine can time it out, retry
 * it, or interrupt it — none of which is possible once eager work has been
 * returned, because the work is already running. That single change lets the
 * engine drop its hand-rolled timeout race and its retry loop.
 *
 * `R` is `never` on every operation. A reporter's own dependencies — a
 * filesystem, a logger — are supplied by the `Layer` that builds it, never by
 * the caller, so they do not appear in the interface. A port that leaked them
 * would force every consumer to discover and provide them.
 *
 * No member is optional. The interface this replaces used `onX?()` /
 * `wrapUp?()`, which made every broadcast site branch on `typeof reporter.X`
 * and made a reporter that ignored an event indistinguishable from one that
 * had not been updated for it. A reporter with nothing to do for an event
 * returns `Effect.void`.
 *
 * Outcomes are not errors. A failing test, a surviving mutant, or a compile
 * error in the code under test is a value on the success channel. The error
 * channel (`ReporterFailed`) is only for the reporter itself breaking
 * (filesystem, serialization, or plugin-author code throwing), and it carries
 * `reporterName` and `event` because the broadcast fans out to N reporters
 * and "a reporter threw" is not actionable.
 */
export interface ReporterService {
  readonly onDryRunCompleted: (event: DryRunCompletedEvent) => Effect.Effect<void, ReporterFailed>

  readonly onMutationTestingPlanReady: (
    event: MutationTestingPlanReadyEvent,
  ) => Effect.Effect<void, ReporterFailed>

  readonly onMutantTested: (result: Readonly<MutantResult>) => Effect.Effect<void, ReporterFailed>

  /**
   * Called when mutation testing is done.
   * The `report` shape is `mutation-testing-report-schema`'s `MutationTestResult`;
   * it is restated as an owned `Wire` declaration in a later unit that owns `src/core/**` — that directory is off-limits here.
   */
  readonly onMutationTestReportReady: (
    report: Readonly<schema.MutationTestResult>,
    metrics: Readonly<MutationTestMetricsResult>,
  ) => Effect.Effect<void, ReporterFailed>

  /**
   * Called when Stryker wants to quit — gives the reporter a chance to finish
   * async work. No arguments, so it is a plain `Effect`, not a thunk.
   */
  readonly wrapUp: Effect.Effect<void, ReporterFailed>
}

export class Reporter extends Context.Service<Reporter, ReporterService>()(
  '@systemfsoftware/stryker-js-plugin-api/report/Reporter',
) {}
