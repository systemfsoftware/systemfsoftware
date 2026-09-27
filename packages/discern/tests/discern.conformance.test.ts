import { Conformance } from '@systemfsoftware/conformance-spec'
import { Discern } from '@systemfsoftware/discern'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Schema } from 'effect'
import type * as AiError from 'effect/unstable/ai/AiError'
import {
  answeredRisky,
  fakeModel,
  input,
  risk,
  ruleFrom,
  type StopWorld,
  stopWorld,
  urgent,
} from './__fixtures__/stop-world.fixture.js'

const Feature = makeFeature({ it })

type AskFailure = AiError.AiError | Discern.DecisionIdCollisionError

type PolicyFailure =
  | AiError.AiError
  | Discern.DecisionIdCollisionError
  | Discern.InvalidThresholdError
  | Discern.PolicyCommandRejected
  | Discern.UncertainMatchError

const fakeOf = (world: StopWorld): Discern.Model.Provider => fakeModel({ world, answerFor: answeredRisky })

const modelLayer = (world: StopWorld) => Discern.Model.layer(fakeOf(world), [])

const ranRule = (world: StopWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.suspend(() => {
    if (world.acknowledged.length < 1) {
      return Effect.fail(Conformance.RuleBroken.make({ message: 'the matcher never acknowledged a verdict' }))
    }
    return ruleFrom(
      world.ran.length < world.acknowledged.length
        ? `acknowledged ${world.acknowledged.length} answer(s) after ${world.ran.length} run(s)`
        : undefined,
    )
  })

const conjunctionRule = (world: StopWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.suspend(() => {
    if (world.acknowledged.length < 1) {
      return Effect.fail(Conformance.RuleBroken.make({ message: 'the conjunction never acknowledged a verdict' }))
    }
    return ruleFrom(
      world.acknowledged.some((verdict) => verdict !== 'both')
        ? `answered "${world.acknowledged.join(', ')}" though both questions cleared`
        : undefined,
    )
  })

const answeredRule = (world: StopWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.suspend(() => {
    if (world.acknowledged.length < 1) {
      return Effect.fail(Conformance.RuleBroken.make({ message: 'the decision node never acknowledged an answer' }))
    }
    return ruleFrom(
      world.answered.length < world.acknowledged.length
        ? `acknowledged ${world.acknowledged.length} answer(s) the model never gave`
        : undefined,
    )
  })

const askedProgram = (world: StopWorld): Effect.Effect<void, AskFailure> =>
  Effect.gen(function*() {
    const answer = yield* Effect.provide(Discern.ask(risk, input), modelLayer(world))
    yield* Effect.sync(() => {
      world.acknowledged.push(String(answer.probability))
    })
  })

const ranOver = (world: StopWorld, handler: string, verdict: string): Effect.Effect<string> =>
  Effect.as(
    Effect.sync(() => {
      world.ran.push(handler)
    }),
    verdict,
  )

const policyOf = (world: StopWorld) =>
  Discern.type(Schema.String).pipe(
    Discern.when(
      Discern.and(risk.above(0.8), urgent.above(0.8)),
      () => ranOver(world, 'both', 'both'),
    ),
    Discern.orElse(() => ranOver(world, 'none', 'none')),
  )

const policyProgram = (world: StopWorld): Effect.Effect<void, PolicyFailure> =>
  Effect.gen(function*() {
    const verdict = yield* Effect.provide(policyOf(world)(input), modelLayer(world))
    yield* Effect.sync(() => {
      world.acknowledged.push(verdict)
    })
  })

Feature('Stopping the discern decision, pattern, and matcher layers at every step', { timeout: 0 })
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A decision node stopped mid-ask never hands back an answer the model did not give',
      Gherkin.Do.pipe(
        When('the check stops the decision node at every step')(
          'checked',
          () =>
            Conformance.stopped({
              unit: Discern.on,
              world: Effect.sync(stopWorld),
              program: askedProgram,
              restart: askedProgram,
              rule: answeredRule,
              stopWithin: Duration.zero,
            }),
        ),
        Then('it passes every cut')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )

    scenario(
      'A conjunction stopped mid-evaluation never resolves to a verdict its answers do not support',
      Gherkin.Do.pipe(
        When('the check stops the policy built on the conjunction at every step')(
          'checked',
          () =>
            Conformance.stopped({
              unit: Discern.and,
              world: Effect.sync(stopWorld),
              program: policyProgram,
              restart: policyProgram,
              rule: conjunctionRule,
              stopWithin: Duration.zero,
            }),
        ),
        Then('it passes every cut')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )

    scenario(
      'A matcher stopped mid-run never hands back a verdict its handlers did not produce',
      Gherkin.Do.pipe(
        When('the check stops the matcher at every step')(
          'checked',
          () =>
            Conformance.stopped({
              unit: Discern.type,
              world: Effect.sync(stopWorld),
              program: policyProgram,
              restart: policyProgram,
              rule: ranRule,
              stopWithin: Duration.zero,
            }),
        ),
        Then('it passes every cut')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )
  })
