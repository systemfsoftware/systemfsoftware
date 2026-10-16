import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { Probability, RouteCandidate } from './Route.schema.js'

const RouteDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/RouteDecision')
type RouteDecisionTypeId = typeof RouteDecisionTypeId

/**
 * The router picked one procedure: the leader cleared both thresholds, or
 * eligibility left only one candidate, so no model was consulted at all.
 */
export class RouteMatched extends Schema.TaggedClass<RouteMatched>()('RouteMatched', {
  id: Schema.String,
  probability: Schema.Finite,
  margin: Schema.Finite,
  by: Schema.Literals(['model', 'elimination']),
  ranked: Schema.Array(RouteCandidate),
}) {
  readonly [RouteDecisionTypeId] = RouteDecisionTypeId
}

/**
 * No procedure won outright. The whole distribution travels with the decision,
 * so a caller deciding what to do about the uncertainty sees what the router
 * saw.
 */
export class RouteUncertain extends Schema.TaggedClass<RouteUncertain>()('RouteUncertain', {
  reason: Schema.String,
  ranked: Schema.Array(RouteCandidate),
}) {
  readonly [RouteDecisionTypeId] = RouteDecisionTypeId
}

export class RouteNone extends Schema.TaggedClass<RouteNone>()('RouteNone', {
  reason: Schema.String,
}) {
  readonly [RouteDecisionTypeId] = RouteDecisionTypeId
}

export const SelectRouteDecision = Schema.Union([RouteMatched, RouteUncertain, RouteNone])
export type SelectRouteDecision = typeof SelectRouteDecision.Type

export type RouteUncertainOf<Ids extends string = string> =
  & Omit<(typeof RouteUncertain)['Encoded'], 'ranked'>
  & {
    readonly ranked: ReadonlyArray<RouteCandidate<Ids>>
  }

export type Route<Ids extends string = string> =
  | (Omit<(typeof RouteMatched)['Encoded'], 'id' | 'ranked'> & {
    readonly id: Ids
    readonly ranked: ReadonlyArray<RouteCandidate<Ids>>
  })
  | RouteUncertainOf<Ids>
  | (typeof RouteNone)['Encoded']

export class NoEligible extends Schema.TaggedClass<NoEligible>()('NoEligible', {
  membership: Schema.Array(Schema.String),
}) {}

export class OneEligible extends Schema.TaggedClass<OneEligible>()('OneEligible', {
  candidate: RouteCandidate,
}) {}

export class ManyEligible extends Schema.TaggedClass<ManyEligible>()('ManyEligible', {
  leader: RouteCandidate,
  runnerUp: RouteCandidate,
  ranked: Schema.Array(RouteCandidate),
}) {}

/**
 * The eligibility outcome the registry computed before anything was asked:
 * no candidate at all, exactly one (so the question answers itself), or the
 * model's distribution over two or more.
 */
export const EligibilityOutcome = Schema.Union([NoEligible, OneEligible, ManyEligible])
export type EligibilityOutcome = typeof EligibilityOutcome.Type

export class SelectRoute extends Schema.TaggedClass<SelectRoute>()('SelectRoute', {
  eligibility: EligibilityOutcome,
  minProbability: Schema.Finite,
  minMargin: Schema.Finite,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const noEligibleReason = (membership: ReadonlyArray<string>): string =>
  `no procedure is eligible for this input (of ${membership.join(', ')})`

const certainProbability = Probability.make(1)

const eliminationMatch = (candidate: RouteCandidate): RouteMatched =>
  new RouteMatched({
    id: candidate.id,
    probability: 1,
    margin: 1,
    by: 'elimination',
    ranked: [{ id: candidate.id, probability: certainProbability }],
  })

const modelMatch = (outcome: ManyEligible): RouteMatched =>
  new RouteMatched({
    id: outcome.leader.id,
    probability: outcome.leader.probability,
    margin: outcome.leader.probability - outcome.runnerUp.probability,
    by: 'model',
    ranked: outcome.ranked,
  })

const uncertainReason = (outcome: ManyEligible, command: SelectRoute): string =>
  Match.value(outcome.leader.probability < command.minProbability).pipe(
    Match.when(
      true,
      () =>
        `no procedure reached ${command.minProbability} (best was ${outcome.leader.id} at ${
          outcome.leader.probability.toFixed(3)
        })`,
    ),
    Match.when(
      false,
      () =>
        `${outcome.leader.id} led ${outcome.runnerUp.id} by only ${
          (outcome.leader.probability - outcome.runnerUp.probability).toFixed(3)
        }, under ${command.minMargin}`,
    ),
    Match.exhaustive,
  )

const rankedOutcome = (outcome: ManyEligible, command: SelectRoute): SelectRouteDecision => {
  const confident = Match.value(outcome.leader.probability >= command.minProbability).pipe(
    Match.when(true, () => outcome.leader.probability - outcome.runnerUp.probability >= command.minMargin),
    Match.when(false, () => false),
    Match.exhaustive,
  )
  return Match.value(confident).pipe(
    Match.when(true, () => modelMatch(outcome)),
    Match.when(false, () => new RouteUncertain({ reason: uncertainReason(outcome, command), ranked: outcome.ranked })),
    Match.exhaustive,
  )
}

const decideRoute = (command: SelectRoute): Result.Result<SelectRouteDecision, never> =>
  Match.value(command.eligibility).pipe(
    Match.tag(
      'NoEligible',
      (outcome) => Result.succeed(new RouteNone({ reason: noEligibleReason(outcome.membership) })),
    ),
    Match.tag('OneEligible', (outcome) => Result.succeed(eliminationMatch(outcome.candidate))),
    Match.tag('ManyEligible', (outcome) => Result.succeed(rankedOutcome(outcome, command))),
    Match.exhaustive,
  )

/**
 * Choose a route from what eligibility left. A near-tie is uncertainty rather
 * than a coin flip, and eligibility ruling everything out is a fact, not a
 * guess — the two are kept apart.
 */
export const selectRoute = Workflow.make({
  command: SelectRoute,
  decision: SelectRouteDecision,
  error: Schema.Never,
  decide: decideRoute,
})
