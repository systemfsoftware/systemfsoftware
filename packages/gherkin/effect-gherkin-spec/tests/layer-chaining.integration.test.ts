import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer } from 'effect'

const Feature = makeFeature({ it })

const counters = { aBuilt: 0, aReleased: 0, bBuilt: 0, bReleased: 0 }

class ServiceA extends Context.Service<ServiceA, { readonly n: number }>()(
  '@systemfsoftware/effect-gherkin-spec/tests/ChainedServiceA',
) {}

class ServiceB extends Context.Service<ServiceB, { readonly fromA: number }>()(
  '@systemfsoftware/effect-gherkin-spec/tests/ChainedServiceB',
) {}

class Scratch extends Context.Service<Scratch, { readonly ready: true }>()(
  '@systemfsoftware/effect-gherkin-spec/tests/ChainedScratch',
) {}

const layerA = Layer.effect(
  ServiceA,
  Effect.acquireRelease(
    Effect.sync(() => {
      counters.aBuilt += 1
      return { n: counters.aBuilt }
    }),
    () => Effect.sync(() => (counters.aReleased += 1)),
  ),
)

const layerB = Layer.effect(
  ServiceB,
  Effect.acquireRelease(
    Effect.gen(function*() {
      const a = yield* ServiceA
      counters.bBuilt += 1
      return { fromA: a.n }
    }),
    () => Effect.sync(() => (counters.bReleased += 1)),
  ),
)

const scenarioLayer = Layer.succeed(Scratch, { ready: true as const })

Feature('a later layer reads an earlier one')
  .withScenarioLayer(scenarioLayer)
  .withLayer(layerA)
  .withLayer(layerB)
  .body(({ scenario }) => {
    scenario(
      'the later layer, the scenario and both layers all see the one build',
      Gherkin.Do.pipe(
        Given('the later layer has read the earlier one')('b', () => ServiceB),
        Then('the earlier layer is built once and the later layer carries its value')((s, expect) =>
          Effect.gen(function*() {
            const a = yield* ServiceA
            return { a: a.n, b: s.b.fromA, counters: { ...counters } }
          }).pipe(
            Effect.map((facts) =>
              expect(facts).toEqual({
                a: 1,
                b: 1,
                counters: { aBuilt: 1, aReleased: 0, bBuilt: 1, bReleased: 0 },
              })
            ),
          )
        ),
      ),
    )
  })

it('Should_ReleaseEveryChainedSharedLayerOnce_When_TheFeatureEnds', function*({ expect }) {
  yield* expect({ ...counters }).toEqual({ aBuilt: 1, aReleased: 1, bBuilt: 1, bReleased: 1 })
})
