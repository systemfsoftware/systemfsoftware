import { Discern } from '@systemfsoftware/discern'
import { Context, Effect, Layer, MutableRef } from 'effect'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'

export class CountingModel extends Context.Service<CountingModel, {
  readonly model: Discern.Model.Provider
  readonly calls: () => number
  readonly asked: () => ReadonlyArray<ReadonlyArray<string>>
}>()('@systemfsoftware/discern/tests/CountingModel') {}

export type AnswerFor = (
  request: DecisionModel.ProviderOptions,
) => Readonly<Record<string, DecisionModel.ProviderAnswer>>

export const answersFor = (
  request: DecisionModel.ProviderOptions,
  answerOf: (decision: Discern.AnyDecision, id: string) => DecisionModel.ProviderAnswer,
): Readonly<Record<string, DecisionModel.ProviderAnswer>> => {
  const answers: Record<string, DecisionModel.ProviderAnswer> = {}
  for (const [id, decision] of Object.entries(request.decisions)) {
    answers[id] = answerOf(decision, id)
  }
  return answers
}

const uncountedUsage = { inputTokens: undefined, outputTokens: undefined } as const

export const answering = (answerFor: AnswerFor): Layer.Layer<DecisionModel.DecisionModel | CountingModel> =>
  Layer.unwrap(
    Effect.sync(() => {
      const calls = MutableRef.make(0)
      const asked = MutableRef.make<ReadonlyArray<ReadonlyArray<string>>>([])
      const model = Discern.Model.provider(
        (request): Effect.Effect<DecisionModel.ProviderResponse, AiError.AiError> => {
          MutableRef.set(calls, MutableRef.get(calls) + 1)
          MutableRef.set(asked, [...MutableRef.get(asked), Object.keys(request.decisions)])
          return Effect.succeed({ answers: answerFor(request), usage: uncountedUsage })
        },
      )
      return Layer.mergeAll(
        Discern.Model.fromProvider(model),
        Layer.succeed(CountingModel, {
          model,
          calls: () => MutableRef.get(calls),
          asked: () => MutableRef.get(asked),
        }),
      )
    }),
  )

export const probabilityEverywhere = (probability: number): AnswerFor => (request) =>
  answersFor(request, () => probabilityAnswer(probability))

export const classificationEverywhere =
  (label: string, probabilities: Readonly<Record<string, number>>): AnswerFor => (request) =>
    answersFor(request, () => classifyAnswer(label, probabilities))

export const classifyAnswer = (
  label: string,
  probabilities: Readonly<Record<string, number>>,
): DecisionModel.ProviderClassifyAnswer => ({ _tag: 'Classify', label, probabilities })

export const probabilityAnswer = (probability: number): DecisionModel.ProviderProbabilityAnswer => ({
  _tag: 'Probability',
  probability,
})

export const rateAnswer = (
  rating: number,
  probabilities: Readonly<Record<string, number>>,
): DecisionModel.ProviderRateAnswer => ({ _tag: 'Rate', rating, probabilities })

export const withProvider = <A, E>(
  effect: Effect.Effect<A, E, DecisionModel.DecisionModel>,
  model: Discern.Model.Provider,
  interceptors: ReadonlyArray<Discern.Model.Interceptor> = [],
): Effect.Effect<A, E, never> => Effect.provide(effect, Discern.Model.layer(model, interceptors))

export interface Tally {
  readonly bump: () => void
  readonly count: () => number
}

export const tally = (): Tally => {
  const counter = MutableRef.make(0)
  return {
    bump: () => {
      MutableRef.set(counter, MutableRef.get(counter) + 1)
    },
    count: () => MutableRef.get(counter),
  }
}
