import { Conformance } from '@systemfsoftware/conformance-spec'
import { Discern } from '@systemfsoftware/discern'
import { Deferred, Effect, Option, Schema } from 'effect'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { type AnswerFor, probabilityAnswer } from './counting-model.fixture.js'
import type { ModelUnderTest } from './decision-model-laws.fixture.js'

/**
 * The fake of the outside model plus the in-process state a restart reads: the
 * observation store, the budget, and what the fake was asked, answered, and had
 * acknowledged back to the caller. One world is built per check run, so every
 * cut sees the same state a process kill would leave behind (KTD8).
 */
export interface StopWorld {
  readonly store: Discern.Model.ObservationStore
  readonly budget: Discern.Model.Budget
  readonly asked: Array<ReadonlyArray<string>>
  readonly answered: Array<string>
  readonly acknowledged: Array<string>
  readonly ran: Array<string>
  readonly charged: Array<number>
  readonly down: { value: boolean }
}

export const unlimited: Discern.Model.BudgetLimits = {
  decisions: Discern.Model.Unlimited.make({}),
  calls: Discern.Model.Unlimited.make({}),
}

export const stopWorld = (): StopWorld => ({
  store: Discern.Model.store(),
  budget: Discern.Model.budget(unlimited),
  asked: [],
  answered: [],
  acknowledged: [],
  ran: [],
  charged: [],
  down: { value: false },
})

const uncountedUsage = { inputTokens: undefined, outputTokens: undefined } as const

export interface FakeModelOptions {
  readonly world: StopWorld
  readonly answerFor: AnswerFor
  readonly entered?: Deferred.Deferred<void> | undefined
}

/** The fake outside model: it sleeps, then answers, and it logs what it was asked. */
export const fakeModel = ({ world, answerFor, entered }: FakeModelOptions): Discern.Model.Provider =>
  Discern.Model.provider((request) =>
    Effect.suspend(() => {
      world.asked.push(Object.keys(request.decisions))
      const reached = Option.match(Option.fromNullishOr(entered), {
        onNone: () => Effect.void,
        onSome: (signal) => Deferred.succeed(signal, void 0),
      })
      if (world.down.value) return Effect.andThen(reached, Effect.never)
      return Effect.andThen(
        reached,
        Effect.map(Effect.sleep('2 millis'), (): DecisionModel.ProviderResponse => {
          const answers = answerFor(request)
          world.answered.push(...Object.keys(answers))
          return { answers, usage: uncountedUsage }
        }),
      )
    })
  )

export const fakeModelUnderTest = ({ world, answerFor }: FakeModelOptions): Effect.Effect<ModelUnderTest> =>
  Effect.gen(function*() {
    const entered = yield* Deferred.make<void>()
    return {
      decide: fakeModel({ world, answerFor, entered }).decide,
      entered: Deferred.await(entered),
      takeDown: Effect.sync(() => {
        world.down.value = true
      }),
    }
  })

export const risk = Discern.on(Schema.String).probability({ id: 'risk', instructions: 'Risky' })

export const urgent = Discern.on(Schema.String).probability({ id: 'urgent', instructions: 'Urgent' })

export const input = 'deploy on friday'

export const answeredRisky: AnswerFor = (request) =>
  Object.fromEntries(Object.keys(request.decisions).map((id) => [id, probabilityAnswer(0.9)]))

export const observation = {
  decisionId: 'risk',
  fingerprint: 'df_recorded',
  kind: 'Probability',
  region: [],
  answer: probabilityAnswer(0.9),
} as const

export const address = 'o_recorded'

/** A world whose store already holds one recorded answer for `risk`. */
export const seededWorld: Effect.Effect<StopWorld> = Effect.orDie(
  Effect.gen(function*() {
    const world = stopWorld()
    yield* Effect.provide(
      Discern.ask(risk, input),
      Discern.Model.layer(fakeModel({ world, answerFor: answeredRisky }), [Discern.Model.recording(world.store)]),
    )
    world.asked.length = 0
    world.answered.length = 0
    return world
  }),
)

/** The decision ids the store holds an observation for, read off the durable state. */
export const recordedIds = (world: StopWorld): Effect.Effect<ReadonlyArray<string>> =>
  Effect.map(
    Discern.Model.snapshot(world.store),
    (observations) => Object.values(observations.entries).map((observation) => observation.decisionId),
  )

export const askedIds = (world: StopWorld): ReadonlyArray<string> => world.asked.flat()

export const ruleFrom = (message: string | undefined): Effect.Effect<void, Conformance.RuleBroken> =>
  message === undefined ? Effect.void : Effect.fail(Conformance.RuleBroken.make({ message }))

export const missingIn = (held: ReadonlyArray<string>) => (owed: ReadonlyArray<string>): string | undefined => {
  const lost = owed.filter((id) => !held.includes(id))
  return lost.length === 0 ? undefined : `lost ${lost.length} acknowledged answer(s): ${lost.join(', ')}`
}
