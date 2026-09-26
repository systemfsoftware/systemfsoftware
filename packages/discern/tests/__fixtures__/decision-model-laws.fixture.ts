import type { Discern } from '@systemfsoftware/discern'
import { Effect, Exit, Fiber, Option } from 'effect'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'

export interface LawObservation {
  readonly answered: ReadonlyArray<string>
}

export interface LawCase {
  readonly name: string
  readonly check: Effect.Effect<LawObservation>
  readonly expected: LawObservation
}

export type DecisionModelLawSuite = readonly [LawCase, LawCase, LawCase]

export interface ModelUnderTest {
  readonly decide: Discern.Model.Provider['decide']
  readonly entered: Effect.Effect<void>
  readonly takeDown: Effect.Effect<void>
}

export interface DecisionModelLawOptions {
  readonly model: Effect.Effect<ModelUnderTest>
  readonly request: DecisionModel.ProviderOptions
}

const STOP_WINDOW = '50 millis'

const answeredIn = (response: DecisionModel.ProviderResponse): LawObservation => ({
  answered: Object.keys(response.answers),
})

const lawOf = (
  name: string,
  expected: LawObservation,
  check: Effect.Effect<LawObservation, AiError.AiError>,
): LawCase => ({ name, expected, check: Effect.orDie(check) })

export const decisionModelLaws = ({ model, request }: DecisionModelLawOptions): DecisionModelLawSuite => [
  lawOf(
    'a decision call answers every decision it was asked about',
    { answered: Object.keys(request.decisions) },
    Effect.gen(function*() {
      const underTest = yield* model
      return answeredIn(yield* underTest.decide(request))
    }),
  ),
  lawOf(
    'a decision call to a model that went away hands back nothing',
    { answered: [] },
    Effect.gen(function*() {
      const underTest = yield* model
      yield* underTest.takeDown
      const response = yield* Effect.timeoutOption(underTest.decide(request), STOP_WINDOW)
      return Option.isNone(response) ? { answered: [] } : answeredIn(response.value)
    }),
  ),
  lawOf(
    'a stop that interrupts a decision call hands back no answer',
    { answered: [] },
    Effect.gen(function*() {
      const underTest = yield* model
      const call = yield* Effect.forkChild(underTest.decide(request))
      yield* underTest.entered
      yield* Fiber.interrupt(call)
      const exit = yield* Effect.exit(Fiber.join(call))
      return Exit.isSuccess(exit) ? answeredIn(exit.value) : { answered: [] }
    }),
  ),
]
