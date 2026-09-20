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
    'A failure on side B specifically attributes the step error to side B',
    Effect.gen(function*() {
      const workload = (w: { readonly value: string }) => {
        if (w.value === 'side-a') {
          return Effect.succeed(true)
        }
        return Effect.fail('side_b_defect')
      }
      const piped = Gherkin.Do.pipe(
        PairwiseAB('executing widget operation')('dual', (_s) => workload),
        Then('unreachable step')(() => Effect.void),
      )
      const result = yield* Effect.result(piped)
      if (!Result.isFailure(result)) throw new Error('Expected Result.failure but got Result.success')
      expect(result.failure).toBeInstanceOf(StepError)
      expect(result.failure.keyword).toBe('pairwise')
      expect(result.failure.text).toBe('executing widget operation [B]')
      expect(result.failure.cause).toBe('side_b_defect')
    }),
  )

  scenario(
    'A failure on side A halts execution immediately and never evaluates side B',
    Effect.gen(function*() {
      let sideBExecuted = false
      const workload = (w: { readonly value: string }) => {
        if (w.value === 'side-a') {
          return Effect.fail('side_a_fatal')
        }
        sideBExecuted = true
        return Effect.succeed(true)
      }
      const piped = Gherkin.Do.pipe(
        PairwiseAB('executing widget operation')('dual', (_s) => workload),
        Then('unreachable step')(() => Effect.void),
      )
      const result = yield* Effect.result(piped)
      if (!Result.isFailure(result)) throw new Error('Expected Result.failure')
      expect(result.failure).toBeInstanceOf(StepError)
      expect(result.failure.cause).toBe('side_a_fatal')
      expect(sideBExecuted).toBe(false)
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
