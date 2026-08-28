import { Evaluator, EvaluatorFailed } from '@systemfsoftware/stryker-js/Evaluator'
import type { ExitClass } from '@systemfsoftware/stryker-js/Evaluator'
import { RunConfiguration } from '@systemfsoftware/stryker-js/Plugin'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { judgeTestContribution } from './test-contribution.js'

import type { schema } from '@systemfsoftware/stryker-js/Mutant'

/** @public */
export const makeTestContributionEvaluatorService = (options: {
  readonly disableBail: boolean
}): { readonly evaluate: (report: schema.MutationTestResult) => Effect.Effect<ExitClass | null, EvaluatorFailed> } => ({
  evaluate: (report) =>
    Effect.gen(function*() {
      const verdict = yield* Effect.try({
        try: () => judgeTestContribution(report, options.disableBail === true),
        catch: (cause) => EvaluatorFailed.make({ cause }),
      })
      if (!verdict.failed) {
        // product output: gate passed — user-visible confirmation (interface, not instrumentation)
        yield* Effect.logInfo(verdict.message)
        return null
      }
      // product output: gate failed — verdict on success channel, log preserves the offending file
      yield* Effect.logError(`${verdict.message}\nSetting exit code to 1 (failure).`)
      yield* Effect.logInfo(
        '(sharpen or delete them, or remove the test-contribution plugin from `plugins` to prevent this error in the future)',
      )
      return 'VerdictFail'
    }),
})

const make = Effect.gen(function*() {
  const options = yield* RunConfiguration
  return Evaluator.of(makeTestContributionEvaluatorService(options))
})

/** @public */
export const testContributionEvaluatorLayer: Layer.Layer<Evaluator, never, RunConfiguration> = Layer.effect(
  Evaluator,
  make,
)
