import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { Verdict } from './Verdict.schema.js'

const CombineAnyRelationsTypeId: unique symbol = Symbol.for('@systemfsoftware/trace-spec/CombineAnyRelations')
type CombineAnyRelationsTypeId = typeof CombineAnyRelationsTypeId

/** At least one relation held, so the disjunction holds over every inspected span. */
export class AnyRelationHeld extends Schema.TaggedClass<AnyRelationHeld>()('AnyRelationHeld', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
}) {
  readonly [CombineAnyRelationsTypeId] = CombineAnyRelationsTypeId
}

/** No relation held: every conjunct is named in the break. */
export class NoRelationHeld extends Schema.TaggedClass<NoRelationHeld>()('NoRelationHeld', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
  detail: Schema.String,
}) {
  readonly [CombineAnyRelationsTypeId] = CombineAnyRelationsTypeId
}

export const CombineAnyRelationsDecision = Schema.Union([AnyRelationHeld, NoRelationHeld])
export type CombineAnyRelationsDecision = typeof CombineAnyRelationsDecision.Type

export class CombineAnyRelations extends Schema.TaggedClass<CombineAnyRelations>()('CombineAnyRelations', {
  conjunct: Schema.String,
  verdicts: Schema.Array(Verdict),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const holds = (verdict: Verdict): boolean =>
  Match.value(verdict).pipe(
    Match.tag('Hold', () => true),
    Match.tag('Break', () => false),
    Match.exhaustive,
  )

const inspectedOf = (verdicts: ReadonlyArray<Verdict>): ReadonlyArray<string> =>
  Arr.flatMap(verdicts, (verdict) => verdict.inspected)

const namedConjuncts = (verdicts: ReadonlyArray<Verdict>): string =>
  Arr.join(Arr.map(verdicts, (verdict) => verdict.conjunct), ', ')

const decide = (command: CombineAnyRelations): Result.Result<CombineAnyRelationsDecision, never> =>
  Result.succeed(
    Match.value(Arr.some(command.verdicts, holds)).pipe(
      Match.when(true, () =>
        new AnyRelationHeld({ conjunct: command.conjunct, inspected: inspectedOf(command.verdicts) })),
      Match.when(false, () =>
        new NoRelationHeld({
          conjunct: command.conjunct,
          inspected: inspectedOf(command.verdicts),
          detail: namedConjuncts(command.verdicts),
        })),
      Match.exhaustive,
    ),
  )

/** `any(...)`: holds as soon as one relation holds, and otherwise breaks naming every conjunct. */
export const combineAnyRelations = Workflow.make({
  command: CombineAnyRelations,
  decision: CombineAnyRelationsDecision,
  error: Schema.Never,
  decide,
})
