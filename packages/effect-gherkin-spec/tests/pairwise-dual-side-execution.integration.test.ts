/**
 * pairwiseFor — dual-side execution across two layers.
 *
 * Drives the `pairwiseFor` use case end-to-end through `makeFeature.scenario`
 * to prove that one workload runs against two distinct service layers and
 * receives both results back into the scope. Failure and layer-acquisition
 * behaviours are covered through the same scenario surface.
 */
import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, pairwiseFor, StepError, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Ref, Result } from 'effect'
import { UnknownError } from 'effect/Cause'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

class Widget extends Context.Service<Widget, { readonly value: string }>()(
  '@systemfsoftware/effect-gherkin-spec/tests/pairwise-dual-side-execution.integration.test/Widget',
) {}

const layerA = Layer.succeed(Widget, { value: 'side-a' })
const layerB = Layer.succeed(Widget, { value: 'side-b' })

const PairwiseAB = pairwiseFor(
  { a: { name: 'A', layer: layerA }, b: { name: 'B', layer: layerB } },
  Widget,
)

Feature('pairwiseFor — dual-side execution').body(({ scenario }) => {
  scenario(
    'Running a workload against two sides yields distinct service values',
    Gherkin.Do.pipe(
      PairwiseAB('the workload reads Widget')('dual', () => (w) => Effect.succeed(w.value)),
      Then('the two values match their layers')(({ dual }) =>
        Effect.sync(() => {
          expect(dual.a).toBe('side-a')
          expect(dual.b).toBe('side-b')
          expect(dual.aLabel).toBe('A')
          expect(dual.bLabel).toBe('B')
        })
      ),
    ),
  )

  scenario(
    'A failure on one side surfaces as a step failure',
    Effect.gen(function*() {
      const piped = Gherkin.Do.pipe(
        PairwiseAB('boom on B only')('dual', (_s) => (w) =>
          w.value === 'side-a'
            ? Effect.succeed(true)
            : Effect.fail(new UnknownError(new Error('boom')))),
        Then('unreachable')(() => Effect.void),
      )
      const result = yield* Effect.result(piped)
      if (!Result.isFailure(result)) throw new Error('Expected Result.failure but got Result.success')
      expect(result.failure).toBeInstanceOf(StepError)
    }),
  )

  scenario(
    'Each side acquires its layer separately',
    Effect.gen(function*() {
      const counter = yield* Ref.make(0)
      const layerSide = Layer.effect(
        Widget,
        Ref.updateAndGet(counter, (n) => n + 1).pipe(
          Effect.map((n) => ({ value: `fresh-${n}` })),
        ),
      )
      const PairwiseFresh = pairwiseFor(
        { a: { name: 'FA', layer: layerSide }, b: { name: 'FB', layer: layerSide } },
        Widget,
      )
      yield* Gherkin.Do.pipe(
        PairwiseFresh('read widget')('dual', () => (w) => Effect.succeed(w.value)),
        Then('two sequential acquire increments')(({ dual }) =>
          Effect.sync(() => {
            expect(dual.a).toBe('fresh-1')
            expect(dual.b).toBe('fresh-2')
          })
        ),
      )
    }),
  )
})
