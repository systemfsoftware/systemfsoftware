import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Schema } from 'effect'
import { absurd } from 'effect/Function'
import * as Result from 'effect/Result'
import {
  AnyRelationHeld,
  CombineAnyRelations,
  combineAnyRelations,
  type CombineAnyRelationsDecision,
  NoRelationHeld,
} from '../combine-any-relations.workflow.js'
import { Hold, Verdict } from '../Verdict.schema.js'

const deciding = (verdicts: ReadonlyArray<Verdict>): CombineAnyRelationsDecision =>
  Result.match(combineAnyRelations(new CombineAnyRelations({ conjunct: 'any(x)', verdicts })), {
    onFailure: (unreachable: never): CombineAnyRelationsDecision => absurd(unreachable),
    onSuccess: (decision): CombineAnyRelationsDecision => decision,
  })

const joinedIds = (ids: ReadonlyArray<string>): string => Arr.join(ids, '|')

const anyHolds = (verdicts: ReadonlyArray<Verdict>): boolean => verdicts.some((verdict) => Schema.is(Hold)(verdict))

it.prop(
  '∀v_RelationVerdicts_=AnyHeld',
  { of: [Schema.Array(Verdict)], subject: deciding },
  (subject, [verdicts]) => {
    if (!anyHolds(verdicts)) return true
    const decision = subject(verdicts)
    return Schema.is(AnyRelationHeld)(decision) &&
      decision.conjunct === 'any(x)' &&
      joinedIds(decision.inspected) === joinedIds(Arr.flatMap(verdicts, (verdict) => verdict.inspected))
  },
)

it.prop(
  '∀v_RelationVerdicts_=NoHoldNames',
  { of: [Schema.Array(Verdict)], subject: deciding },
  (subject, [verdicts]) => {
    if (anyHolds(verdicts)) return true
    const decision = subject(verdicts)
    return Schema.is(NoRelationHeld)(decision) &&
      decision.conjunct === 'any(x)' &&
      decision.detail === Arr.join(Arr.map(verdicts, (verdict) => verdict.conjunct), ', ') &&
      joinedIds(decision.inspected) === joinedIds(Arr.flatMap(verdicts, (verdict) => verdict.inspected))
  },
)
