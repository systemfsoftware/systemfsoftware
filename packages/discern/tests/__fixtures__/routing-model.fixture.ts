import { Discern } from '@systemfsoftware/discern'
import { Array as Arr, Context, Effect, Layer, Match, MutableRef, Schema } from 'effect'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import {
  type AnswerFor,
  answering,
  answersFor,
  classifyAnswer,
  CountingModel,
  probabilityAnswer,
} from './counting-model.fixture.js'

export type RoutingPreferences = Readonly<Record<string, number>>

type Seen = DecisionModel.ProviderOptions['state']

const coversExactly = (preferences: RoutingPreferences, labels: ReadonlyArray<string>): boolean =>
  Object.keys(preferences).length === labels.length && labels.every((label) => Object.hasOwn(preferences, label))

const probabilitiesFor = (
  preferences: RoutingPreferences,
  labels: ReadonlyArray<string>,
): Readonly<Record<string, number>> => {
  if (coversExactly(preferences, labels)) {
    return Object.fromEntries(Arr.map(labels, (label) => [label, preferences[label] ?? 0]))
  }
  const weights = Arr.map(labels, (label) => (Object.hasOwn(preferences, label) ? (preferences[label] ?? 0) : 0))
  const total = Arr.reduce(weights, 0, (sum, weight) => sum + weight)
  return Object.fromEntries(
    Arr.map(labels, (label, index) => [
      label,
      total === 0 ? 1 / Math.max(labels.length, 1) : (weights[index] ?? 0) / total,
    ]),
  )
}

const leaderOf = (probabilities: Readonly<Record<string, number>>, labels: ReadonlyArray<string>): string =>
  Arr.reduce(
    labels,
    labels[0] ?? '',
    (best, candidate) => ((probabilities[candidate] ?? 0) > (probabilities[best] ?? 0) ? candidate : best),
  )

interface RoutingAnswerOptions {
  readonly preferences: RoutingPreferences
  readonly decision: Discern.AnyDecision
}

export const routingAnswer = ({ preferences, decision }: RoutingAnswerOptions): DecisionModel.ProviderAnswer =>
  Match.value(decision).pipe(
    Match.tag('Classify', (classified) => {
      const labels = Object.keys(classified.criteria)
      const probabilities = probabilitiesFor(preferences, labels)
      return classifyAnswer({ label: leaderOf(probabilities, labels), probabilities })
    }),
    Match.orElse(() => probabilityAnswer(0.9)),
  )

export const routingTo = (preferences: RoutingPreferences): AnswerFor => (request) =>
  answersFor({ request, answerOf: (decision) => routingAnswer({ preferences, decision }) })

const labelsIn = (request: DecisionModel.ProviderOptions): ReadonlyArray<string> =>
  Arr.flatten(
    Arr.flatMap(Object.values(request.decisions), (decision) =>
      Match.value(decision).pipe(
        Match.tag('Classify', (classified) => [Object.keys(classified.criteria)]),
        Match.orElse((): ReadonlyArray<ReadonlyArray<string>> => []),
      )),
  )

export class RoutingSight extends Context.Service<
  RoutingSight,
  {
    readonly states: () => ReadonlyArray<Seen>
    readonly offered: () => ReadonlyArray<ReadonlyArray<string>>
  }
>()('@systemfsoftware/discern/tests/RoutingSight') {}

export const watchingRouting = (
  preferences: RoutingPreferences,
): Layer.Layer<DecisionModel.DecisionModel | CountingModel | RoutingSight> =>
  Layer.unwrap(
    Effect.sync(() => {
      const states = MutableRef.make<ReadonlyArray<Seen>>([])
      const offered = MutableRef.make<ReadonlyArray<ReadonlyArray<string>>>([])
      const recorded: AnswerFor = (request) => {
        MutableRef.set(states, [...MutableRef.get(states), request.state])
        MutableRef.set(offered, [...MutableRef.get(offered), labelsIn(request)])
        return answersFor({ request, answerOf: (decision) => routingAnswer({ preferences, decision }) })
      }
      return Layer.merge(
        answering(recorded),
        Layer.succeed(RoutingSight, {
          states: () => MutableRef.get(states),
          offered: () => MutableRef.get(offered),
        }),
      )
    }),
  )

export const refusalOf = (attempt: () => void): Error => {
  try {
    attempt()
    return new Error('expected a refusal, but nothing was thrown')
  } catch (error) {
    return error instanceof Error ? error : new Error('a non-Error was thrown', { cause: error })
  }
}

export const matchedRouteOf = <Ids extends string>(
  route: Discern.Procedure.Route<Ids>,
): Extract<Discern.Procedure.Route<Ids>, { readonly _tag: 'RouteMatched' }> =>
  Match.value(route).pipe(
    Match.tag('RouteMatched', (matched) => matched),
    Match.orElse((other) => {
      throw new Error(`expected a matched route, got ${JSON.stringify(other)}`)
    }),
  )

export const uncertainRouteOf = <Ids extends string>(
  route: Discern.Procedure.Route<Ids>,
): Extract<Discern.Procedure.Route<Ids>, { readonly _tag: 'RouteUncertain' }> =>
  Match.value(route).pipe(
    Match.tag('RouteUncertain', (uncertain) => uncertain),
    Match.orElse((other) => {
      throw new Error(`expected an uncertain route, got ${JSON.stringify(other)}`)
    }),
  )

export const noneRouteOf = <Ids extends string>(
  route: Discern.Procedure.Route<Ids>,
): Extract<Discern.Procedure.Route<Ids>, { readonly _tag: 'RouteNone' }> =>
  Match.value(route).pipe(
    Match.tag('RouteNone', (none) => none),
    Match.orElse((other) => {
      throw new Error(`expected an unroutable route, got ${JSON.stringify(other)}`)
    }),
  )

export const ReleaseTicket = Schema.Struct({
  ask: Schema.String,
  environment: Schema.String,
  evidence: Schema.String,
})

export type ReleaseTicket = typeof ReleaseTicket.Type

interface TicketOptions {
  readonly ask: string
  readonly environment?: string
  readonly evidence?: string
}

export const ticket = (
  { ask, environment = 'production', evidence = 'a very large blob' }: TicketOptions,
): ReleaseTicket => ({
  ask,
  environment,
  evidence,
})
