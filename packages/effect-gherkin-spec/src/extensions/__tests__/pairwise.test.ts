import { describe, expect, it, layer } from '@effect/vitest'
import { Context, Effect, Either, Layer, Ref } from 'effect'
import { UnknownException } from 'effect/Cause'

import { Gherkin, Then } from '../../do-notation.js'
import { pairwiseFor } from '../../extensions/pairwise.js'
import { makeFeature } from '../../feature.js'
import { StepError } from '../../step-error.js'

const Feature = makeFeature({ it, layer })

class Widget extends Context.Tag('test/Widget')<Widget, { readonly value: string }>() {}

const layerA = Layer.succeed(Widget, { value: 'side-a' })
const layerB = Layer.succeed(Widget, { value: 'side-b' })

const PairwiseAB = pairwiseFor({ a: { name: 'A', layer: layerA }, b: { name: 'B', layer: layerB } }, Widget)

Feature('pairwiseFor')
  .body(({ scenario }) => {
    scenario(
      'Should_ReadDistinctServices_When_PairwiseRunsTwoSides',
      Gherkin.Do.pipe(
        PairwiseAB('the workload reads Widget')(
          'dual',
          () => (w) => Effect.succeed(w.value),
        ),
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
  })

describe('pairwiseFor extras', () => {
  it.effect('Should_FailWithStepError_When_SecondSideFails', () =>
    Effect.gen(function*() {
      const piped = Gherkin.Do.pipe(
        PairwiseAB('boom on B only')(
          'dual',
          (_s) => (w) =>
            w.value === 'side-a'
              ? Effect.succeed(true)
              : Effect.fail(new UnknownException(new Error('boom'))),
        ),
        Then('unreachable')(() => Effect.void),
      )
      const result = yield* Effect.either(piped)
      if (!Either.isLeft(result)) throw new Error('Expected Either.left but got Either.right')
      expect(result.left).toBeInstanceOf(StepError)
    }))

  it.effect('Should_IncrementAcquireCount_When_PairwiseRunsLayerFreshTwice', () =>
    Effect.gen(function*() {
      const counter = yield* Ref.make(0)
      const layerSide = Layer.effect(
        Widget,
        Ref.updateAndGet(counter, (n) => n + 1).pipe(Effect.map((n) => ({ value: `fresh-${n}` }))),
      )
      const PairwiseFresh = pairwiseFor(
        { a: { name: 'FA', layer: layerSide }, b: { name: 'FB', layer: layerSide } },
        Widget,
      )
      yield* Gherkin.Do.pipe(
        PairwiseFresh('read widget')(
          'dual',
          () => (w) => Effect.succeed(w.value),
        ),
        Then('two sequential acquire increments')(({ dual }) =>
          Effect.sync(() => {
            expect(dual.a).toBe('fresh-1')
            expect(dual.b).toBe('fresh-2')
          })
        ),
      )
    }))
})
