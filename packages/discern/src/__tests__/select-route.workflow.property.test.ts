import { it } from '@effect/vitest'
import { Array as Arr, Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { RouteCandidate } from '../Route.schema.js'
import {
  type EligibilityOutcome,
  ManyEligible,
  NoEligible,
  OneEligible,
  type Route,
  SelectRoute,
  selectRoute,
} from '../select-route.workflow.js'

const commandOf = (
  eligibility: EligibilityOutcome,
  minProbability: number,
  minMargin: number,
): SelectRoute => new SelectRoute({ eligibility, minProbability, minMargin })

const holds = (verdicts: ReadonlyArray<boolean>): boolean => Arr.every(verdicts, (verdict) => verdict)

const rankedIdsOf = (ranked: ReadonlyArray<RouteCandidate>): string =>
  Arr.map(ranked, (candidate) => candidate.id).join(',')

const rankedProbabilitiesOf = (ranked: ReadonlyArray<RouteCandidate>): string =>
  Arr.map(ranked, (candidate) => candidate.probability).join(',')

const isModelMatchOf = (route: Route, leader: RouteCandidate, runnerUp: RouteCandidate, margin: number): boolean =>
  Match.value(route).pipe(
    Match.tag('RouteMatched', (matched) =>
      holds([
        matched.id === leader.id,
        matched.probability === leader.probability,
        matched.margin === margin,
        matched.by === 'model',
        rankedIdsOf(matched.ranked) === rankedIdsOf([leader, runnerUp]),
        rankedProbabilitiesOf(matched.ranked) === rankedProbabilitiesOf([leader, runnerUp]),
      ])),
    Match.orElse(() => false),
  )

const isUncertainOf = (route: Route, reason: string, ranked: ReadonlyArray<RouteCandidate>): boolean =>
  Match.value(route).pipe(
    Match.tag(
      'RouteUncertain',
      (uncertain) =>
        holds([uncertain.reason.startsWith(reason), rankedIdsOf(uncertain.ranked) === rankedIdsOf(ranked)]),
    ),
    Match.orElse(() => false),
  )

const isEliminationMatchOf = (route: Route, id: string): boolean =>
  Match.value(route).pipe(
    Match.tag('RouteMatched', (matched) =>
      holds([
        matched.id === id,
        matched.by === 'elimination',
        matched.probability === 1,
        matched.margin === 1,
        rankedIdsOf(matched.ranked) === id,
        rankedProbabilitiesOf(matched.ranked) === '1',
      ])),
    Match.orElse(() => false),
  )

const isNoneOf = (route: Route, membership: ReadonlyArray<string>): boolean =>
  Match.value(route).pipe(
    Match.tag('RouteNone', (none) =>
      holds([
        none.reason.startsWith('no procedure is eligible'),
        none.reason.endsWith(`(of ${membership.join(', ')})`),
      ])),
    Match.orElse(() => false),
  )

type Select = typeof selectRoute

const verdictOf = (select: Select, command: SelectRoute): Route =>
  Result.match(select(command), {
    onFailure: (impossible) => impossible,
    onSuccess: (route) => route,
  })

it.prop(
  '∀c_WeakLeader_=Uncertain',
  {
    of: [
      Schema.String,
      Schema.String,
      Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.1, maximum: 0.4 }))),
      Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.5, maximum: 0.7 }))),
      Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 0.1 }))),
      Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.05, maximum: 0.4 }))),
    ],
    subject: selectRoute,
  },
  (subject, [leaderId, runnerUpId, leaderProbability, minProbability, gap, minMargin]) => {
    const leader = { id: leaderId, probability: leaderProbability }
    const runnerUp = { id: runnerUpId, probability: leaderProbability - gap }
    const route = verdictOf(
      subject,
      commandOf(new ManyEligible({ leader, runnerUp, ranked: [leader, runnerUp] }), minProbability, minMargin),
    )
    return isUncertainOf(route, 'no procedure reached', [leader, runnerUp])
  },
)

it.prop(
  '∀c_ThinMargin_=Uncertain',
  {
    of: [
      Schema.String,
      Schema.String,
      Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.75, maximum: 0.95 }))),
      Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.5, maximum: 0.7 }))),
      Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 0.1 }))),
      Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.2, maximum: 0.4 }))),
    ],
    subject: selectRoute,
  },
  (subject, [leaderId, runnerUpId, leaderProbability, minProbability, gap, minMargin]) => {
    const leader = { id: leaderId, probability: leaderProbability }
    const runnerUp = { id: runnerUpId, probability: leaderProbability - gap }
    const route = verdictOf(
      subject,
      commandOf(new ManyEligible({ leader, runnerUp, ranked: [leader, runnerUp] }), minProbability, minMargin),
    )
    return isUncertainOf(route, `${leaderId} led ${runnerUpId} by only `, [leader, runnerUp])
  },
)

it.prop(
  '∀c_ConfidentLeader_=MatchedByModel',
  {
    of: [
      Schema.String,
      Schema.String,
      Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0.8, maximum: 1 }))),
      Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 0.5 }))),
      Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 0.5 }))),
    ],
    subject: selectRoute,
  },
  (subject, [leaderId, runnerUpId, leaderProbability, minProbability, runnerUpProbability]) => {
    const leader = { id: leaderId, probability: leaderProbability }
    const runnerUp = { id: runnerUpId, probability: runnerUpProbability }
    const route = verdictOf(
      subject,
      commandOf(new ManyEligible({ leader, runnerUp, ranked: [leader, runnerUp] }), minProbability, 0.15),
    )
    return isModelMatchOf(route, leader, runnerUp, leaderProbability - runnerUpProbability)
  },
)

it.prop(
  '∀c_SingleEligible_=MatchedByElimination',
  { of: [RouteCandidate], subject: selectRoute },
  (subject, [candidate]) => {
    const route = verdictOf(subject, commandOf(new OneEligible({ candidate }), 0.7, 0.15))
    return isEliminationMatchOf(route, candidate.id)
  },
)

it.prop(
  '∀c_NoEligible_=None',
  { of: [Schema.Array(Schema.String)], subject: selectRoute },
  (subject, [membership]) => {
    const route = verdictOf(subject, commandOf(new NoEligible({ membership }), 0.7, 0.15))
    return isNoneOf(route, membership)
  },
)
