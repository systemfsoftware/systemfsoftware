import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { CacheMode } from '../Config/config.schema.js'
import { FailureCode } from '../verdict/failure.schema.js'
import { CacheWrite, Count, StepRecord } from '../verdict/step-record.schema.js'
import { entryWireBytesOf, sameFlow, TraceEntry } from './entry.schema.js'
import { KeyDigest } from './key.schema.js'

const SettleRecordingsTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/SettleRecordings')

const WIRE_BYTES_CAP = 1_048_576

const MODEL_UNREACHABLE: ReadonlyArray<FailureCode> = ['MODEL_UNAVAILABLE', 'MODEL_PROVIDER_FAILED']

const VERIFICATION_TAGS: ReadonlyArray<string> = ['LocatorStep', 'AssertStep', 'WaitForStep']

const InterruptedEnding = Schema.TaggedStruct('Interrupted', {})

const PassedEnding = Schema.TaggedStruct('Passed', {})

const FailedEnding = Schema.TaggedStruct('Failed', { failure: FailureCode })

export const AttemptEnding = Schema.Union([InterruptedEnding, PassedEnding, FailedEnding])
export type AttemptEnding = typeof AttemptEnding.Type

const WriteStaged = Schema.TaggedStruct('Write', { entry: TraceEntry })

const OverwriteStaged = Schema.TaggedStruct('Overwrite', { entry: TraceEntry, existing: TraceEntry })

const KeepStaged = Schema.TaggedStruct('Keep', {})

const DecidedStaged = Schema.TaggedStruct('Decided', { outcome: Schema.Literals(['evicted', 'no-change']) })

export const StagedRecording = Schema.Struct({
  stepIndex: Count,
  digest: KeyDigest,
  recording: Schema.Union([WriteStaged, OverwriteStaged, KeepStaged, DecidedStaged]).pipe(
    Schema.toTaggedUnion('_tag'),
  ),
})
export type StagedRecording = typeof StagedRecording.Type

export const RecordingOutcome = Schema.Struct({ stepIndex: Count, write: CacheWrite })
export type RecordingOutcome = typeof RecordingOutcome.Type

export const EntryWrite = Schema.Struct({ digest: KeyDigest, entry: TraceEntry })
export type EntryWrite = typeof EntryWrite.Type

export class Settled extends Schema.TaggedClass<Settled>()('Settled', {
  outcomes: Schema.Array(RecordingOutcome),
  writes: Schema.Array(EntryWrite),
  deletes: Schema.Array(KeyDigest),
}) {
  readonly [SettleRecordingsTypeId] = SettleRecordingsTypeId
}

export class Untouched extends Schema.TaggedClass<Untouched>()('Untouched', {}) {
  readonly [SettleRecordingsTypeId] = SettleRecordingsTypeId
}

export const SettleRecordingsDecision = Schema.Union([Settled, Untouched])
export type SettleRecordingsDecision = typeof SettleRecordingsDecision.Type

export class SettleRecordings extends Schema.TaggedClass<SettleRecordings>()('SettleRecordings', {
  mode: CacheMode,
  ending: AttemptEnding,
  steps: Schema.Array(StepRecord),
  staged: Schema.Array(StagedRecording),
}) {
  static readonly [Workflow.InstrumentationBrand] = { mode: 'app.e2e.cache.settle-mode' } as const
}

type SettledEnding = typeof PassedEnding.Type | typeof FailedEnding.Type

type WriteRecording = typeof WriteStaged.Type

type OverwriteRecording = typeof OverwriteStaged.Type

interface SettlePiece {
  readonly outcome: RecordingOutcome
  readonly entry: Option.Option<EntryWrite>
  readonly remove: Option.Option<KeyDigest>
}

const piece = (
  staged: StagedRecording,
  write: CacheWrite,
  entry: Option.Option<EntryWrite>,
  remove: Option.Option<KeyDigest>,
): SettlePiece => ({
  outcome: { stepIndex: staged.stepIndex, write },
  entry,
  remove,
})

const passed = (step: StepRecord): boolean =>
  Match.valueTags(step.outcome, {
    Passed: () => true,
    Skipped: () => false,
    Inconclusive: () => false,
    Failed: () => false,
  })

const confirmedAt = (steps: ReadonlyArray<StepRecord>, stepIndex: number): boolean =>
  Arr.some(steps, (step, at) =>
    Arr.every(
      [at > stepIndex, Arr.contains(VERIFICATION_TAGS, step._tag), passed(step)],
      (condition) => condition,
    ))

const implicatesOf = (ending: SettledEnding): boolean =>
  Match.value(ending).pipe(
    Match.tag('Passed', (): boolean => true),
    Match.tag('Failed', (failed) => !Arr.contains(MODEL_UNREACHABLE, failed.failure)),
    Match.exhaustive,
  )

const freshWritePiece = (staged: StagedRecording, entry: TraceEntry): SettlePiece =>
  Match.value(entryWireBytesOf(entry) > WIRE_BYTES_CAP).pipe(
    Match.when(true, (): SettlePiece => piece(staged, 'not-written', Option.none(), Option.none())),
    Match.when(
      false,
      (): SettlePiece => piece(staged, 'saved', Option.some({ digest: staged.digest, entry }), Option.none()),
    ),
    Match.exhaustive,
  )

const confirmedWritePiece = (staged: StagedRecording, write: WriteRecording | OverwriteRecording): SettlePiece =>
  Match.value(write).pipe(
    Match.tag('Write', (fresh) => freshWritePiece(staged, fresh.entry)),
    Match.tag('Overwrite', (overwrite) =>
      Match.value(sameFlow(overwrite.existing, overwrite.entry)).pipe(
        Match.when(true, (): SettlePiece => piece(staged, 'kept', Option.none(), Option.none())),
        Match.when(false, () => freshWritePiece(staged, overwrite.entry)),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const deleteOf = (implicates: boolean, digest: KeyDigest): Option.Option<KeyDigest> =>
  Option.filter(Option.some(digest), () => implicates)

const unconfirmedWritePiece = (implicates: boolean) => (staged: StagedRecording): SettlePiece =>
  piece(staged, 'unconfirmed', Option.none(), deleteOf(implicates, staged.digest))

const unconfirmedKeepPiece = (implicates: boolean) => (staged: StagedRecording): SettlePiece =>
  Match.value(implicates).pipe(
    Match.when(true, (): SettlePiece => piece(staged, 'evicted', Option.none(), Option.some(staged.digest))),
    Match.when(false, (): SettlePiece => piece(staged, 'unconfirmed', Option.none(), Option.none())),
    Match.exhaustive,
  )

const stagedWritePiece = (
  steps: ReadonlyArray<StepRecord>,
  implicates: boolean,
  staged: StagedRecording,
  write: WriteRecording | OverwriteRecording,
): SettlePiece =>
  Match.value(confirmedAt(steps, staged.stepIndex)).pipe(
    Match.when(true, () => confirmedWritePiece(staged, write)),
    Match.when(false, () => unconfirmedWritePiece(implicates)(staged)),
    Match.exhaustive,
  )

const settlePiece = (steps: ReadonlyArray<StepRecord>, implicates: boolean) => (staged: StagedRecording): SettlePiece =>
  Match.value(staged.recording).pipe(
    Match.tag('Decided', (decided) => piece(staged, decided.outcome, Option.none(), Option.none())),
    Match.tag('Keep', () =>
      Match.value(confirmedAt(steps, staged.stepIndex)).pipe(
        Match.when(true, () => piece(staged, 'kept', Option.none(), Option.none())),
        Match.when(false, () => unconfirmedKeepPiece(implicates)(staged)),
        Match.exhaustive,
      )),
    Match.tag('Write', (write) => stagedWritePiece(steps, implicates, staged, write)),
    Match.tag('Overwrite', (overwrite) => stagedWritePiece(steps, implicates, staged, overwrite)),
    Match.exhaustive,
  )

const settledOf = (command: SettleRecordings, ending: SettledEnding): SettleRecordingsDecision => {
  const pieces = Arr.map(command.staged, settlePiece(command.steps, implicatesOf(ending)))
  return new Settled({
    outcomes: Arr.map(pieces, (part) => part.outcome),
    writes: Arr.getSomes(Arr.map(pieces, (part) => part.entry)),
    deletes: Arr.getSomes(Arr.map(pieces, (part) => part.remove)),
  })
}

const endedDecision = (command: SettleRecordings, ending: SettledEnding): SettleRecordingsDecision =>
  Match.value(command.mode).pipe(
    Match.when('read-write', (): SettleRecordingsDecision => settledOf(command, ending)),
    Match.whenOr('off', 'read-only', (): SettleRecordingsDecision => new Untouched({})),
    Match.exhaustive,
  )

const decide = (command: SettleRecordings): Result.Result<SettleRecordingsDecision, never> =>
  Result.succeed(
    Match.value(command.ending).pipe(
      Match.tag('Interrupted', (): SettleRecordingsDecision => new Untouched({})),
      Match.tag('Passed', (passed) => endedDecision(command, passed)),
      Match.tag('Failed', (failed) => endedDecision(command, failed)),
      Match.exhaustive,
    ),
  )

export const settleRecordings = Workflow.make({
  command: SettleRecordings,
  decision: SettleRecordingsDecision,
  error: Schema.Never,
  decide,
})
