import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { PatternStatus } from './Verdict.schema.js'

const SelectCaseDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/SelectCaseDecision')
type SelectCaseDecisionTypeId = typeof SelectCaseDecisionTypeId

export class CaseSelected extends Schema.TaggedClass<CaseSelected>()('CaseSelected', {
  caseId: Schema.String,
}) {
  readonly [SelectCaseDecisionTypeId] = SelectCaseDecisionTypeId
}

export class FallbackSelected extends Schema.TaggedClass<FallbackSelected>()('FallbackSelected', {}) {
  readonly [SelectCaseDecisionTypeId] = SelectCaseDecisionTypeId
}

export class UncertainHandled extends Schema.TaggedClass<UncertainHandled>()('UncertainHandled', {
  caseId: Schema.String,
  reason: Schema.optional(Schema.String),
}) {
  readonly [SelectCaseDecisionTypeId] = SelectCaseDecisionTypeId
}

export class UncertainUnhandled extends Schema.TaggedError<UncertainUnhandled>()('UncertainUnhandled', {
  caseId: Schema.String,
  reason: Schema.optional(Schema.String),
}) {}

export const SelectCaseDecision = Schema.Union([CaseSelected, FallbackSelected, UncertainHandled])
export type SelectCaseDecision = typeof SelectCaseDecision.Type

/** One evaluated case in dispatch order: its id, how it resolved, and why. */
export const CaseVerdict = Schema.Struct({
  caseId: Schema.String,
  status: PatternStatus,
  reason: Schema.optional(Schema.String),
})
export type CaseVerdict = typeof CaseVerdict.Type

type DecisiveCase = CaseVerdict & { readonly status: 'Match' | 'Uncertain' }

export class SelectCase extends Schema.TaggedClass<SelectCase>()('SelectCase', {
  cases: Schema.Array(CaseVerdict),
  hasUncertainHandler: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {
    hasUncertainHandler: 'app.discern.select-case.has-uncertain-handler',
  } as const
}

const uncertainOutcome = (
  item: DecisiveCase,
  hasUncertainHandler: boolean,
): Result.Result<SelectCaseDecision, UncertainUnhandled> =>
  Match.value(hasUncertainHandler).pipe(
    Match.when(true, () => Result.succeed(new UncertainHandled({ caseId: item.caseId, reason: item.reason }))),
    Match.when(false, () => Result.fail(new UncertainUnhandled({ caseId: item.caseId, reason: item.reason }))),
    Match.exhaustive,
  )

const decisiveOutcome = (
  item: DecisiveCase,
  hasUncertainHandler: boolean,
): Result.Result<SelectCaseDecision, UncertainUnhandled> =>
  Match.value(item.status).pipe(
    Match.when('Match', () => Result.succeed(new CaseSelected({ caseId: item.caseId }))),
    Match.when('Uncertain', () => uncertainOutcome(item, hasUncertainHandler)),
    Match.exhaustive,
  )

export const selectCase = Workflow.make({
  command: SelectCase,
  decision: SelectCaseDecision,
  error: UncertainUnhandled,
  decide: ({ cases, hasUncertainHandler }): Result.Result<SelectCaseDecision, UncertainUnhandled> =>
    Arr.findFirst(cases, (item): item is DecisiveCase => item.status !== 'Miss').pipe(
      Option.match({
        onNone: () => Result.succeed(new FallbackSelected({})),
        onSome: (item) => decisiveOutcome(item, hasUncertainHandler),
      }),
    ),
})
