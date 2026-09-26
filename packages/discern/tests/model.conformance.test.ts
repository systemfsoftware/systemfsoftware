import { Conformance } from '@systemfsoftware/conformance-spec'
import { Discern } from '@systemfsoftware/discern'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Option } from 'effect'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import {
  address,
  answeredRisky,
  askedIds,
  fakeModel,
  input,
  missingIn,
  observation,
  recordedIds,
  risk,
  ruleFrom,
  seededWorld,
  type StopWorld,
  stopWorld,
} from './__fixtures__/stop-world.fixture.js'

const Feature = makeFeature({ it })

type AskFailure = AiError.AiError | Discern.DecisionIdCollisionError

const askFor = (world: StopWorld, layer: Layer.Layer<DecisionModel.DecisionModel>): Effect.Effect<void, AskFailure> =>
  Effect.gen(function*() {
    yield* Effect.provide(Discern.ask(risk, input), layer)
    yield* Effect.sync(() => {
      world.acknowledged.push('risk')
    })
  })

const fakeOf = (world: StopWorld): Discern.Model.Provider => fakeModel({ world, answerFor: answeredRisky })

const cachingLayer = (world: StopWorld): Layer.Layer<DecisionModel.DecisionModel> =>
  Discern.Model.layer(fakeOf(world), [Discern.Model.caching(world.store)])

const replayingLayer = (world: StopWorld): Layer.Layer<DecisionModel.DecisionModel> =>
  Discern.Model.layer(fakeOf(world), [Discern.Model.replaying(world.store, { onMissing: 'ask' })])

const budgetedLayer = (world: StopWorld): Layer.Layer<DecisionModel.DecisionModel> =>
  Discern.Model.layer(fakeOf(world), [Discern.Model.budgeted(world.budget)])

const recordedRule = (world: StopWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.suspend(() => {
    if (world.acknowledged.length < 1) {
      return Effect.fail(Conformance.RuleBroken.make({ message: 'the caching model never acknowledged an answer' }))
    }
    return Effect.flatMap(recordedIds(world), (held) => ruleFrom(missingIn(held)(world.acknowledged)))
  })

const chargedRule = (world: StopWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.suspend(() => {
    if (world.answered.length < 1) {
      return Effect.fail(Conformance.RuleBroken.make({ message: 'the model never gave an answer' }))
    }
    return Effect.flatMap(
      Discern.Model.spent(world.budget),
      (spend) =>
        ruleFrom(
          spend.calls < world.answered.length
            ? `charged ${spend.calls} call(s) for ${world.answered.length} answer(s)`
            : undefined,
        ),
    )
  })

const replayRule = (world: StopWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.flatMap(recordedIds(world), (held) =>
    Effect.suspend(() => {
      if (world.acknowledged.length < 1) {
        return Effect.fail(
          Conformance.RuleBroken.make({ message: 'the replaying model never acknowledged an answer' }),
        )
      }
      const reasked = askedIds(world).filter((id) => held.includes(id))
      return ruleFrom(
        reasked.length === 0
          ? missingIn([...held, ...world.answered])(world.acknowledged)
          : `asked the model for recorded decision(s): ${reasked.join(', ')}`,
      )
    }))

const budgetProgram = (world: StopWorld): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* Discern.Model.chargeBudget(world.budget, 3)
    yield* Effect.sync(() => {
      world.charged.push(3)
    })
  })

const budgetRule = (world: StopWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.suspend(() => {
    if (world.charged.length < 1) {
      return Effect.fail(Conformance.RuleBroken.make({ message: 'the budget was never charged' }))
    }
    return Effect.flatMap(
      Discern.Model.spent(world.budget),
      (spend) =>
        ruleFrom(
          spend.decisions < world.charged.reduce((sum, amount) => sum + amount, 0)
            ? `spent ${spend.decisions} for ${world.charged.length} acknowledged charge(s)`
            : undefined,
        ),
    )
  })

const storeProgram = (world: StopWorld): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* Discern.Model.set(world.store, address, observation)
    yield* Effect.sleep('1 millis')
    yield* Effect.sync(() => {
      world.acknowledged.push(address)
    })
  })

const storeRule = (world: StopWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.suspend(() => {
    if (world.acknowledged.length < 1) {
      return Effect.fail(Conformance.RuleBroken.make({ message: 'the store never acknowledged a write' }))
    }
    return Effect.flatMap(Discern.Model.get(world.store, address), (found) =>
      ruleFrom(
        world.acknowledged.includes(address) && Option.isNone(found)
          ? 'acknowledged a write that is not readable'
          : undefined,
      ))
  })

Feature('Stopping the discern model at every step', { timeout: 0 })
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A caching model stopped between the answer and the recording never hands that answer back',
      Gherkin.Do.pipe(
        When('the check stops the caching model at every step')(
          'checked',
          () =>
            Conformance.stopped({
              unit: Discern.Model.layer,
              world: Effect.sync(stopWorld),
              program: (world) => askFor(world, cachingLayer(world)),
              restart: (world) => askFor(world, cachingLayer(world)),
              rule: recordedRule,
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
      'A replaying model stopped mid-use never asks the model for a decision the store holds',
      Gherkin.Do.pipe(
        When('the check stops the replaying model at every step')(
          'checked',
          () =>
            Conformance.stopped({
              unit: Discern.Model.layer,
              world: seededWorld,
              program: (world) => askFor(world, replayingLayer(world)),
              restart: (world) => askFor(world, replayingLayer(world)),
              rule: replayRule,
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
      'A budgeted model stopped mid-call never answers without charging the budget',
      Gherkin.Do.pipe(
        When('the check stops the budgeted model at every step')(
          'checked',
          () =>
            Conformance.stopped({
              unit: Discern.Model.layer,
              world: Effect.sync(stopWorld),
              program: (world) => askFor(world, budgetedLayer(world)),
              restart: (world) => askFor(world, budgetedLayer(world)),
              rule: chargedRule,
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
      'A budget stopped mid-charge never acknowledges a charge it did not spend',
      Gherkin.Do.pipe(
        When('the check stops the budget at every step')(
          'checked',
          () =>
            Conformance.stopped({
              unit: Discern.Model.budget,
              world: Effect.sync(stopWorld),
              program: budgetProgram,
              restart: budgetProgram,
              rule: budgetRule,
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
      'An observation store stopped mid-write never acknowledges a write that is not readable',
      Gherkin.Do.pipe(
        When('the check stops the store at every step')(
          'checked',
          () =>
            Conformance.stopped({
              unit: Discern.Model.store,
              world: Effect.sync(stopWorld),
              program: storeProgram,
              restart: storeProgram,
              rule: storeRule,
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
