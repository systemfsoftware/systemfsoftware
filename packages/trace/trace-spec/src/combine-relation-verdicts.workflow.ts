import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import type { Break } from './Verdict.schema.js'
import { Verdict } from './Verdict.schema.js'

const CombineRelationVerdictsTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/trace-spec/CombineRelationVerdicts',
)
type CombineRelationVerdictsTypeId = typeof CombineRelationVerdictsTypeId

export const EvaluatedRelation = Schema.Struct({
  verdict: Verdict,
  soft: Schema.Boolean,
})
export type EvaluatedRelation = typeof EvaluatedRelation.Type

export class FirstHardBreak extends Schema.TaggedClass<FirstHardBreak>()('FirstHardBreak', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
  detail: Schema.String,
}) {
  readonly [CombineRelationVerdictsTypeId] = CombineRelationVerdictsTypeId
}

export class AggregatedSoftBreak extends Schema.TaggedClass<AggregatedSoftBreak>()('AggregatedSoftBreak', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
  detail: Schema.String,
}) {
  readonly [CombineRelationVerdictsTypeId] = CombineRelationVerdictsTypeId
}

export class EveryRelationHeld extends Schema.TaggedClass<EveryRelationHeld>()('EveryRelationHeld', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
}) {
  readonly [CombineRelationVerdictsTypeId] = CombineRelationVerdictsTypeId
}

export const CombineRelationVerdictsDecision = Schema.Union([
  FirstHardBreak,
  AggregatedSoftBreak,
  EveryRelationHeld,
])
export type CombineRelationVerdictsDecision = typeof CombineRelationVerdictsDecision.Type

export class CombineRelationVerdicts extends Schema.TaggedClass<CombineRelationVerdicts>()(
  'CombineRelationVerdicts',
  {
    conjunct: Schema.String,
    verdicts: Schema.Array(EvaluatedRelation),
  },
) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const asBreak = (entry: EvaluatedRelation): Option.Option<Break> =>
  Match.value(entry.verdict).pipe(
    Match.tag('Break', (breach) => Option.some(breach)),
    Match.tag('Hold', () => Option.none()),
    Match.exhaustive,
  )

const breaksIn = (entries: ReadonlyArray<EvaluatedRelation>): ReadonlyArray<Break> =>
  Arr.flatMap(entries, (entry) =>
    Option.match(asBreak(entry), {
      onNone: (): ReadonlyArray<Break> => [],
      onSome: (breach): ReadonlyArray<Break> => [breach],
    }))

const firstHardBreak = (verdicts: ReadonlyArray<EvaluatedRelation>): Option.Option<Break> =>
  Arr.head(breaksIn(Arr.filter(verdicts, (entry) => !entry.soft)))

const softBreaks = (verdicts: ReadonlyArray<EvaluatedRelation>): ReadonlyArray<Break> =>
  breaksIn(Arr.filter(verdicts, (entry) => entry.soft))

const aggregateSoft = (command: CombineRelationVerdicts): CombineRelationVerdictsDecision => {
  const breaks = softBreaks(command.verdicts)
  return Option.match(Arr.head(breaks), {
    onNone: () => new EveryRelationHeld({ conjunct: command.conjunct, inspected: [] }),
    onSome: () =>
      new AggregatedSoftBreak({
        conjunct: command.conjunct,
        inspected: Arr.flatMap(breaks, (breach) => breach.inspected),
        detail: Arr.join(Arr.map(breaks, (breach) => breach.conjunct), ', '),
      }),
  })
}

const decide = (command: CombineRelationVerdicts): Result.Result<CombineRelationVerdictsDecision, never> =>
  Result.succeed(
    Option.match(firstHardBreak(command.verdicts), {
      onNone: () => aggregateSoft(command),
      onSome: (winner) =>
        new FirstHardBreak({ conjunct: winner.conjunct, inspected: winner.inspected, detail: winner.detail }),
    }),
  )

export const combineRelationVerdicts = Workflow.make({
  command: CombineRelationVerdicts,
  decision: CombineRelationVerdictsDecision,
  error: Schema.Never,
  decide,
})
