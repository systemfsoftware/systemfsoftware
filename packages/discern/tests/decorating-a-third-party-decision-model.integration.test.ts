import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { Effect, Layer, MutableRef, Schema } from 'effect'
import * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { answersFor, probabilityAnswer } from './__fixtures__/counting-model.fixture.js'

const Feature = makeFeature({ it })

const Change = Discern.on(Schema.String)

const reviewRisk = Change.probability({ id: 'risk', instructions: 'How risky is this change' })

const blocking = Discern.type(Schema.String).pipe(
  Discern.when(reviewRisk.above(0.8), () => 'block'),
  Discern.orElse(() => 'ship'),
)

interface ThirdPartyModel {
  readonly layer: Layer.Layer<DecisionModel.DecisionModel>
  readonly calls: () => number
}

const thirdPartyModel = (): ThirdPartyModel => {
  const calls = MutableRef.make(0)
  const modelLayer = Layer.effect(DecisionModel.DecisionModel)(
    DecisionModel.make({
      decide: (request) =>
        Effect.sync(() => {
          MutableRef.set(calls, MutableRef.get(calls) + 1)
          return {
            answers: answersFor({ request, answerOf: () => probabilityAnswer(0.95) }),
            usage: { inputTokens: 7, outputTokens: 3 },
          }
        }),
    }),
  )
  return { layer: modelLayer, calls: () => MutableRef.get(calls) }
}

Feature('Decorating a model you did not build')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Recording, caching, and a spending limit wrap a model another package shipped',
      Gherkin.Do.pipe(
        Given('a third-party model that counts its own calls')('thirdParty', () => Effect.succeed(thirdPartyModel())),
        Given('a blocking policy')('policy', () => Effect.succeed(blocking)),
        Given('a recording store and an allowance of one call')('mount', () =>
          Effect.succeed({
            store: Discern.Model.store(),
            spend: Discern.Model.budget({ calls: 1 }),
          })),
        When('the same change is reviewed twice through the decorated model')(
          'verdicts',
          (s) =>
            Effect.gen(function*() {
              const decorated = s.thirdParty.layer.pipe(Discern.Model.intercept([
                Discern.Model.recording(s.mount.store),
                Discern.Model.caching(s.mount.store),
                Discern.Model.budgeted(s.mount.spend),
              ]))
              const firstRun = yield* Effect.provide(s.policy('x'), decorated)
              const secondRun = yield* Effect.provide(s.policy('x'), decorated)
              return { firstRun, secondRun }
            }),
        ),
        Then('the third-party model was asked once, the cache paid no allowance, and the recording replays')((s) =>
          Effect.gen(function*() {
            expect(s.verdicts.firstRun).toBe('block')
            expect(s.verdicts.secondRun).toBe('block')
            expect(s.thirdParty.calls()).toBe(1)
            expect(yield* Discern.Model.size(s.mount.store)).toBe(1)
            expect(yield* Discern.Model.spent(s.mount.spend)).toStrictEqual({ decisions: 1, calls: 1 })
            const taken = yield* Discern.Model.snapshot(s.mount.store)
            const replayed = yield* Effect.provide(s.policy('x'), Discern.Model.replayLayer(taken))
            expect(replayed).toBe('block')
          })
        ),
      ),
    )
  })
