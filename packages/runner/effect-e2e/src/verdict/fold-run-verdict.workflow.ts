import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Order from 'effect/Order'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { type FailureClass, failureClassOf } from './failure-class.schema.js'
import { FailureRecord } from './failure.schema.js'
import { type StepRecord, StepRecord as StepRecords } from './step-record.schema.js'

const RunVerdictDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/RunVerdictDecision')
type RunVerdictDecisionTypeId = typeof RunVerdictDecisionTypeId

const failed = { failures: Schema.NonEmptyArray(FailureRecord) }

export class VerdictPassed extends Schema.TaggedClass<VerdictPassed>()('VerdictPassed', {}) {
  readonly [RunVerdictDecisionTypeId] = RunVerdictDecisionTypeId
}

export class VerdictFailed extends Schema.TaggedClass<VerdictFailed>()('VerdictFailed', failed) {
  readonly [RunVerdictDecisionTypeId] = RunVerdictDecisionTypeId
}

export class VerdictBlocked extends Schema.TaggedClass<VerdictBlocked>()('VerdictBlocked', failed) {
  readonly [RunVerdictDecisionTypeId] = RunVerdictDecisionTypeId
}

export class VerdictErrored extends Schema.TaggedClass<VerdictErrored>()('VerdictErrored', failed) {
  readonly [RunVerdictDecisionTypeId] = RunVerdictDecisionTypeId
}

export class VerdictInterrupted extends Schema.TaggedClass<VerdictInterrupted>()('VerdictInterrupted', failed) {
  readonly [RunVerdictDecisionTypeId] = RunVerdictDecisionTypeId
}

export const RunVerdictDecision = Schema.Union([
  VerdictPassed,
  VerdictFailed,
  VerdictBlocked,
  VerdictErrored,
  VerdictInterrupted,
])
export type RunVerdictDecision = typeof RunVerdictDecision.Type

export class FoldRunVerdict extends Schema.TaggedClass<FoldRunVerdict>()('FoldRunVerdict', {
  steps: Schema.Array(StepRecords),
  runErrors: Schema.Array(FailureRecord),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const SEVERITY: { readonly [Class in FailureClass]: number } = {
  blocking: 0,
  failing: 1,
  internal: 2,
  interrupting: 3,
}

const bySeverity: Order.Order<FailureClass> = Order.mapInput(Order.Number, (verdictClass) => SEVERITY[verdictClass])

const failuresOf = (step: StepRecord): ReadonlyArray<FailureRecord> =>
  Match.value(step.outcome).pipe(
    Match.tag('Passed', (): ReadonlyArray<FailureRecord> => []),
    Match.tag('Skipped', (): ReadonlyArray<FailureRecord> => []),
    Match.tag('Inconclusive', ({ code, evidence }): ReadonlyArray<FailureRecord> => [
      { code, cause: failureClassOf(code).cause, evidence },
    ]),
    Match.tag('Failed', ({ _tag, ...record }): ReadonlyArray<FailureRecord> => [record]),
    Match.exhaustive,
  )

const verdictOf = (failures: Arr.NonEmptyReadonlyArray<FailureRecord>): RunVerdictDecision =>
  Match.value(Arr.max(Arr.map(failures, (failure) => failureClassOf(failure.code).verdictClass), bySeverity)).pipe(
    Match.when('blocking', (): RunVerdictDecision => new VerdictBlocked({ failures })),
    Match.when('failing', (): RunVerdictDecision => new VerdictFailed({ failures })),
    Match.when('internal', (): RunVerdictDecision => new VerdictErrored({ failures })),
    Match.when('interrupting', (): RunVerdictDecision => new VerdictInterrupted({ failures })),
    Match.exhaustive,
  )

const decideRunVerdict = (command: FoldRunVerdict): Result.Result<RunVerdictDecision, never> =>
  Result.succeed(
    Arr.match([...Arr.flatMap(command.steps, failuresOf), ...command.runErrors], {
      onEmpty: (): RunVerdictDecision => new VerdictPassed({}),
      onNonEmpty: verdictOf,
    }),
  )

export const foldRunVerdict = Workflow.make({
  command: FoldRunVerdict,
  decision: RunVerdictDecision,
  error: Schema.Never,
  decide: decideRunVerdict,
})
