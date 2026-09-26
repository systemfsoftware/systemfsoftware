import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { decisionModelLaws, type LawCase } from './__fixtures__/decision-model-laws.fixture.js'
import { answeredRisky, fakeModelUnderTest, input, stopWorld } from './__fixtures__/stop-world.fixture.js'

const Feature = makeFeature({ it })

const request: DecisionModel.ProviderOptions = {
  state: input,
  decisions: { risk: { _tag: 'Probability', instructions: 'Risky' } },
}

const freshModel = Effect.suspend(() => fakeModelUnderTest({ world: stopWorld(), answerFor: answeredRisky }))

const [answersEveryDecision, goneAwayHandsBackNothing, interruptedHandsBackNothing] = decisionModelLaws({
  model: freshModel,
  request,
})

const lawPipeline = (event: string, law: LawCase) =>
  Gherkin.Do.pipe(
    When(event)('outcome', () => law.check),
    Then('the caller is handed exactly what the model owed it')((state, expect) =>
      expect(state.outcome).toEqual(law.expected)
    ),
  )

Feature('A discern model stopped at any step hands its caller no answer it never gave')
  .live('the fake model sleeps on the real clock while a call is in flight')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A decision call hands back an answer for every decision it was asked about',
      lawPipeline('a policy asks the model about one decision', answersEveryDecision),
    )

    scenario(
      'A decision call to a model that went away hands back nothing',
      lawPipeline('the model goes away before the call is answered', goneAwayHandsBackNothing),
    )

    scenario(
      'A stop that interrupts a decision call hands back no answer',
      lawPipeline('a stop interrupts the model while it is deciding', interruptedHandsBackNothing),
    )
  })
