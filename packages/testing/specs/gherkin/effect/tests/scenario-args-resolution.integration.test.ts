/**
 * Scenario registration — argument resolution.
 *
 * Drives `scenario(...)` on `makeFeature` with malformed argument shapes and
 * proves that `resolveScenarioArgs` returns the right defensive pipeline in
 * each case — the kind of failure a downstream consumer would only see if a
 * step body or options object was supplied where it should not have been.
 */
import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { resolveScenarioArgs, StepError } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Result } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Scenario registration — argument resolution').body(({ scenario }) => {
  scenario(
    'An undefined second argument yields a failing pipeline',
    Effect.gen(function*() {
      const { pipeline } = resolveScenarioArgs<never>(void 0, void 0)
      const result = yield* Effect.result(pipeline)
      if (!Result.isFailure(result)) throw new Error('Expected Result.failure but got Result.success')
      expect(result.failure).toBeInstanceOf(StepError)
      expect(result.failure.keyword).toBe('scenario')
      expect(result.failure.text).toBe('pipeline or options required')
    }),
  )

  scenario(
    'Providing options without a pipeline yields a failing pipeline',
    Effect.gen(function*() {
      const { pipeline } = resolveScenarioArgs<never>({ layer: Layer.empty }, void 0)
      const result = yield* Effect.result(pipeline)
      if (!Result.isFailure(result)) throw new Error('Expected Result.failure but got Result.success')
      expect(result.failure).toBeInstanceOf(StepError)
      expect(result.failure.keyword).toBe('scenario')
      expect(result.failure.text).toBe('pipeline is required when options are provided')
    }),
  )
})
