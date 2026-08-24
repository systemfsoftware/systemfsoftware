import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

import type { schema } from '../core/index.js'

import type { EvaluatorFailed } from './EvaluatorFailed.schema.js'
import { ExitClass } from './ExitClass.js'

/**
 * Runs against the finished mutation report. Listing the plugin module
 * activates it — there is no separate name list.
 *
 * Every operation returns an `Effect`, so the engine can time it out, retry
 * it, or interrupt it — none of which is possible once eager work has been
 * returned, because the work is already running.
 *
 * `R` is `never`. An evaluator's own dependencies are supplied by the `Layer`
 * that builds it, never by the caller, so they do not appear in the interface.
 * A port that leaked them would force every consumer to discover and provide
 * them.
 *
 * Outcomes are not errors. A low mutation score or a missing threshold is a
 * value on the success channel: `evaluate` answers with the `ExitClass` the
 * run should end in, or `null` for "nothing to report". The error channel
 * (`EvaluatorFailed`) is only for the evaluator itself breaking.
 *
 * The distinction is the whole reason the success channel is not `void`. A gate
 * that signalled "score below threshold" by failing would be indistinguishable
 * from a gate that could not read the report at all — same channel, same
 * absence of a value — so the engine could neither pick the right exit code nor
 * say which happened.
 */
export interface EvaluatorService {
  readonly evaluate: (
    report: schema.MutationTestResult,
  ) => Effect.Effect<ExitClass | null, EvaluatorFailed>
}

export class Evaluator extends Context.Service<Evaluator, EvaluatorService>()(
  '@systemfsoftware/stryker-js-plugin-api/evaluate/Evaluator',
) {}
