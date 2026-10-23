import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Order from 'effect/Order'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { recordedProposalOf } from './cause.schema.js'
import { type FailureClass, failureClassOf } from './failure-class.schema.js'
import { FailureRecord } from './failure.schema.js'
import { StepRecord } from './step-record.schema.js'

const RunVerdictDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/RunVerdictDecision')
type RunVerdictDecisionTypeId = typeof RunVerdictDecisionTypeId

const withFailures = { failures: Schema.NonEmptyArray(FailureRecord) }

export class VerdictPassed extends Schema.TaggedClass<VerdictPassed>()('VerdictPassed', {}) {
  readonly [RunVerdictDecisionTypeId] = RunVerdictDecisionTypeId
}

export class VerdictFailed extends Schema.TaggedClass<VerdictFailed>()('VerdictFailed', withFailures) {
  readonly [RunVerdictDecisionTypeId] = RunVerdictDecisionTypeId
}

export class VerdictBlocked extends Schema.TaggedClass<VerdictBlocked>()('VerdictBlocked', withFailures) {
  readonly [RunVerdictDecisionTypeId] = RunVerdictDecisionTypeId
}

export class VerdictErrored extends Schema.TaggedClass<VerdictErrored>()('VerdictErrored', withFailures) {
  readonly [RunVerdictDecisionTypeId] = RunVerdictDecisionTypeId
}

export class VerdictInterrupted extends Schema.TaggedClass<VerdictInterrupted>()('VerdictInterrupted', withFailures) {
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
  steps: Schema.Array(StepRecord),
  runErrors: Schema.Array(FailureRecord),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const PRECEDENCE: { readonly [Class in FailureClass]: number } = {
  blocking: 0,
  failing: 1,
  internal: 2,
  interrupting: 3,
}

const byPrecedence: Order.Order<FailureClass> = Order.mapInput(Order.Number, (verdictClass) => PRECEDENCE[verdictClass])

const recordedFailureOf = (failure: FailureRecord): FailureRecord => ({
  code: failure.code,
  cause: failureClassOf(failure.code).cause,
  evidence: failure.evidence,
  ...recordedProposalOf(failure.proposed),
})

const failuresOf = (step: StepRecord): ReadonlyArray<FailureRecord> =>
  Match.value(step.outcome).pipe(
    Match.tag('Passed', (): ReadonlyArray<FailureRecord> => []),
    Match.tag('Skipped', (): ReadonlyArray<FailureRecord> => []),
    Match.tag('Inconclusive', ({ code, evidence }): ReadonlyArray<FailureRecord> => [
      { code, cause: failureClassOf(code).cause, evidence },
    ]),
    Match.tag('Failed', (failed): ReadonlyArray<FailureRecord> => [recordedFailureOf(failed)]),
    Match.exhaustive,
  )

const decisionOf = (failures: Arr.NonEmptyReadonlyArray<FailureRecord>): RunVerdictDecision =>
  Match.value(Arr.max(Arr.map(failures, (failure) => failureClassOf(failure.code).verdictClass), byPrecedence)).pipe(
    Match.when('blocking', (): RunVerdictDecision => new VerdictBlocked({ failures })),
    Match.when('failing', (): RunVerdictDecision => new VerdictFailed({ failures })),
    Match.when('internal', (): RunVerdictDecision => new VerdictErrored({ failures })),
    Match.when('interrupting', (): RunVerdictDecision => new VerdictInterrupted({ failures })),
    Match.exhaustive,
  )

const decideRunVerdict = (command: FoldRunVerdict): Result.Result<RunVerdictDecision, never> =>
  Result.succeed(
    Arr.match(
      Arr.appendAll(Arr.flatMap(command.steps, failuresOf), Arr.map(command.runErrors, recordedFailureOf)),
      { onEmpty: (): RunVerdictDecision => new VerdictPassed({}), onNonEmpty: decisionOf },
    ),
  )

export const foldRunVerdict = Workflow.make({
  command: FoldRunVerdict,
  decision: RunVerdictDecision,
  error: Schema.Never,
  decide: decideRunVerdict,
})
