import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Option, Schema } from 'effect'
import { absurd } from 'effect/Function'
import * as Result from 'effect/Result'
import {
  AggregatedSoftBreak,
  CombineRelationVerdicts,
  combineRelationVerdicts,
  type CombineRelationVerdictsDecision,
  type EvaluatedRelation,
  EvaluatedRelation as EvaluatedRelationSchema,
  EveryRelationHeld,
  FirstHardBreak,
} from '../combine-relation-verdicts.workflow.js'
import { Break } from '../Verdict.schema.js'

const deciding = (evaluated: ReadonlyArray<EvaluatedRelation>): CombineRelationVerdictsDecision =>
  Result.match(combineRelationVerdicts(new CombineRelationVerdicts({ conjunct: 'all(x)', verdicts: evaluated })), {
    onFailure: (unreachable: never): CombineRelationVerdictsDecision => absurd(unreachable),
    onSuccess: (decision): CombineRelationVerdictsDecision => decision,
  })

const breaksAmong = (entries: ReadonlyArray<EvaluatedRelation>): ReadonlyArray<Break> =>
  Arr.getSomes(
    Arr.map(entries, (entry) => (Schema.is(Break)(entry.verdict) ? Option.some(entry.verdict) : Option.none())),
  )

const hardBreaksOf = (evaluated: ReadonlyArray<EvaluatedRelation>): ReadonlyArray<Break> =>
  breaksAmong(Arr.filter(evaluated, (entry) => !entry.soft))

const softBreaksOf = (evaluated: ReadonlyArray<EvaluatedRelation>): ReadonlyArray<Break> =>
  breaksAmong(Arr.filter(evaluated, (entry) => entry.soft))

const everyBreaksOf = (evaluated: ReadonlyArray<EvaluatedRelation>): ReadonlyArray<Break> => breaksAmong(evaluated)

const joinedIds = (ids: ReadonlyArray<string>): string => Arr.join(ids, '|')

it.prop(
  '∀v_RelationVerdicts_=FirstHardBreak',
  { of: [Schema.Array(EvaluatedRelationSchema)], subject: deciding },
  (subject, [evaluated]) =>
    Option.match(Arr.head(hardBreaksOf(evaluated)), {
      onNone: () => true,
      onSome: (first) => {
        const decision = subject(evaluated)
        return Schema.is(FirstHardBreak)(decision) &&
          decision.conjunct === first.conjunct &&
          decision.detail === first.detail &&
          joinedIds(decision.inspected) === joinedIds(first.inspected)
      },
    }),
)

it.prop(
  '∀v_RelationVerdicts_=SoftAggregation',
  { of: [Schema.Array(EvaluatedRelationSchema)], subject: deciding },
  (subject, [evaluated]) => {
    if (hardBreaksOf(evaluated).length > 0) return true
    const soft = softBreaksOf(evaluated)
    if (soft.length === 0) return true
    const decision = subject(evaluated)
    return Schema.is(AggregatedSoftBreak)(decision) &&
      decision.conjunct === 'all(x)' &&
      joinedIds(decision.inspected) === joinedIds(Arr.flatMap(soft, (breach) => breach.inspected)) &&
      decision.detail === Arr.join(Arr.map(soft, (breach) => breach.conjunct), ', ')
  },
)

it.prop(
  '∀v_RelationVerdicts_=EveryHeld',
  { of: [Schema.Array(EvaluatedRelationSchema)], subject: deciding },
  (subject, [evaluated]) => {
    if (everyBreaksOf(evaluated).length > 0) return true
    const decision = subject(evaluated)
    return Schema.is(EveryRelationHeld)(decision) && decision.conjunct === 'all(x)' && decision.inspected.length === 0
  },
)
