import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Match, Schema } from 'effect'
import { absurd } from 'effect/Function'
import * as Result from 'effect/Result'
import {
  BreakNegated,
  HoldNegated,
  NegateRelationVerdict,
  negateRelationVerdict,
  type NegateRelationVerdictDecision,
} from '../negate-relation-verdict.workflow.js'
import { Break, Hold, Verdict } from '../Verdict.schema.js'

const negating = (verdict: Verdict): NegateRelationVerdictDecision =>
  Result.match(negateRelationVerdict(new NegateRelationVerdict({ conjunct: 'not(x)', verdict })), {
    onFailure: (unreachable: never): NegateRelationVerdictDecision => absurd(unreachable),
    onSuccess: (decision): NegateRelationVerdictDecision => decision,
  })

const reverted = (decision: NegateRelationVerdictDecision): Verdict =>
  Match.value(decision).pipe(
    Match.tag('HoldNegated', (negated) =>
      Break.make({ conjunct: negated.conjunct, inspected: negated.inspected, detail: negated.detail })),
    Match.tag('BreakNegated', (negated) =>
      Hold.make({ conjunct: negated.conjunct, inspected: negated.inspected })),
    Match.exhaustive,
  )

const polarised = (verdict: Verdict): boolean => Schema.is(Hold)(verdict)

const joinedIds = (ids: ReadonlyArray<string>): string => Arr.join(ids, '|')

it.prop(
  '∀v_Hold_=NegatedBreak',
  { of: [Hold], subject: negating },
  (subject, [held]) => {
    const decision = subject(held)
    return Schema.is(HoldNegated)(decision) &&
      decision.conjunct === 'not(x)' &&
      decision.detail === `${held.conjunct} held` &&
      joinedIds(decision.inspected) === joinedIds(held.inspected)
  },
)

it.prop(
  '∀v_Break_=NegatedHold',
  { of: [Break], subject: negating },
  (subject, [breach]) => {
    const decision = subject(breach)
    return Schema.is(BreakNegated)(decision) &&
      decision.conjunct === 'not(x)' &&
      joinedIds(decision.inspected) === joinedIds(breach.inspected)
  },
)

it.prop(
  '∀v_DoubleNegation_=Polarity',
  { of: [Verdict], subject: negating },
  (subject, [verdict]) => polarised(reverted(subject(reverted(subject(verdict))))) === polarised(verdict),
)
