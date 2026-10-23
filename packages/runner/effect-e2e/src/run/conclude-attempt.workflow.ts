import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { StagedRecording } from '../cache/settle-recordings.workflow.js'
import { failureClassOf } from '../verdict/failure-class.schema.js'
import { FailureCode, FailureRecord } from '../verdict/failure.schema.js'
import { Count, type StepOutcome, StepRecord } from '../verdict/step-record.schema.js'

const ConcludeAttemptTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/ConcludeAttempt')

const MODEL_UNREACHABLE: ReadonlyArray<FailureCode> = ['MODEL_UNAVAILABLE', 'MODEL_PROVIDER_FAILED']

export const LaunchKind = Schema.Literals(['open', 'act', 'assert', 'waitFor', 'extract'])
export type LaunchKind = typeof LaunchKind.Type

export const Launch = Schema.Struct({
  index: Count,
  kind: LaunchKind,
  text: Schema.String,
  joined: Schema.Boolean,
  settled: Schema.Boolean,
})
export type Launch = typeof Launch.Type

export const SessionRecord = Schema.Struct({
  index: Count,
  step: StepRecord,
  staged: StagedRecording.pipe(Schema.Option),
})
export type SessionRecord = typeof SessionRecord.Type

export const TryEnding = Schema.Union([
  Schema.TaggedStruct('Finished', { errors: Schema.Array(FailureRecord) }),
  Schema.TaggedStruct('Cancelled', {}),
])
export type TryEnding = typeof TryEnding.Type

export class ConcludeAttempt extends Schema.TaggedClass<ConcludeAttempt>()('ConcludeAttempt', {
  ending: TryEnding,
  launches: Schema.Array(Launch),
  records: Schema.Array(SessionRecord),
  sessionErrors: Schema.Array(FailureRecord),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export class TryPassed extends Schema.TaggedClass<TryPassed>()('TryPassed', {
  steps: Schema.Array(StepRecord),
  staged: Schema.Array(StagedRecording),
}) {
  readonly [ConcludeAttemptTypeId] = ConcludeAttemptTypeId
}

export class TryFailed extends Schema.TaggedClass<TryFailed>()('TryFailed', {
  steps: Schema.Array(StepRecord),
  errors: Schema.Array(FailureRecord),
  staged: Schema.Array(StagedRecording),
  blamed: FailureCode,
}) {
  readonly [ConcludeAttemptTypeId] = ConcludeAttemptTypeId
}

export class TryCancelled extends Schema.TaggedClass<TryCancelled>()('TryCancelled', {
  steps: Schema.Array(StepRecord),
  errors: Schema.Array(FailureRecord),
}) {
  readonly [ConcludeAttemptTypeId] = ConcludeAttemptTypeId
}

export const Conclusion = Schema.Union([TryPassed, TryFailed, TryCancelled])
export type Conclusion = typeof Conclusion.Type

const byIndex: Order.Order<SessionRecord> = Order.mapInput(Order.Number, (record: SessionRecord) => record.index)

const failureOf = (code: FailureCode, text: string): FailureRecord => ({
  code,
  cause: failureClassOf(code).cause,
  evidence: [{ _tag: 'LogEvidence', text }],
})

const isUnawaited = (launch: Launch): boolean => [launch.joined, launch.settled].includes(false)

const unawaitedOf = (launch: Launch): FailureRecord =>
  failureOf('STEP_NOT_AWAITED', `${launch.kind} "${launch.text}" was started and not awaited before the test returned`)

const outcomeCodesOf = (outcome: StepOutcome): ReadonlyArray<FailureCode> =>
  Match.value(outcome).pipe(
    Match.tag('Passed', (): ReadonlyArray<FailureCode> => []),
    Match.tag('Skipped', (): ReadonlyArray<FailureCode> => []),
    Match.tag('Inconclusive', ({ code }): ReadonlyArray<FailureCode> => [code]),
    Match.tag('Failed', ({ code }): ReadonlyArray<FailureCode> => [code]),
    Match.exhaustive,
  )

const blamedOf = (codes: Arr.NonEmptyReadonlyArray<FailureCode>): FailureCode =>
  Option.getOrElse(
    Arr.findFirst(codes, (code) => !Arr.contains(MODEL_UNREACHABLE, code)),
    () => Arr.headNonEmpty(codes),
  )

const stagedAt = (records: ReadonlyArray<SessionRecord>): ReadonlyArray<StagedRecording> =>
  Arr.getSomes(
    Arr.map(records, (record, position) =>
      Option.map(record.staged, (staged): StagedRecording => ({ ...staged, stepIndex: position }))),
  )

const finishedOf = (
  records: ReadonlyArray<SessionRecord>,
  errors: ReadonlyArray<FailureRecord>,
): Conclusion => {
  const steps = Arr.map(records, (record) => record.step)
  const codes = [
    ...Arr.flatMap(steps, (step) => outcomeCodesOf(step.outcome)),
    ...Arr.map(errors, (error) => error.code),
  ]
  return Arr.match(codes, {
    onEmpty: (): Conclusion => new TryPassed({ steps, staged: stagedAt(records) }),
    onNonEmpty: (failed): Conclusion =>
      new TryFailed({ steps, errors, staged: stagedAt(records), blamed: blamedOf(failed) }),
  })
}

const decide = (command: ConcludeAttempt): Result.Result<Conclusion, never> => {
  const records = Arr.sort(command.records, byIndex)
  return Result.succeed(
    Match.value(command.ending).pipe(
      Match.tag('Cancelled', (): Conclusion =>
        new TryCancelled({
          steps: Arr.map(records, (record) => record.step),
          errors: [failureOf('INTERRUPTED', 'the try was cancelled')],
        })),
      Match.tag('Finished', ({ errors }) =>
        finishedOf(records, [
          ...errors,
          ...command.sessionErrors,
          ...Arr.map(Arr.filter(command.launches, isUnawaited), unawaitedOf),
        ])),
      Match.exhaustive,
    ),
  )
}

export const concludeAttempt = Workflow.make({
  command: ConcludeAttempt,
  decision: Conclusion,
  error: Schema.Never,
  decide,
})
