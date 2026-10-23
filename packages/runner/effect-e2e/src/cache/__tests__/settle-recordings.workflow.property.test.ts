import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { type Check, CheckRecord } from '../../verdict/check.schema.js'
import { type FailureCode, FailureCode as FailureCodeSchema } from '../../verdict/failure.schema.js'
import { type CacheWrite, StepId, StepRecord } from '../../verdict/step-record.schema.js'
import { entryWireBytesOf, entryWireTextOf, TraceEntry } from '../entry.schema.js'
import { keyDigestOf } from '../key-digest.js'
import { CanonicalJson, type KeyDigest } from '../key.schema.js'
import {
  type EntryWrite,
  type Settled,
  SettleRecordings,
  settleRecordings,
  type SettleRecordingsDecision,
  type StagedRecording,
} from '../settle-recordings.workflow.js'

type Settle = typeof settleRecordings

const WIRE_BYTES_CAP = 1_048_576

const MODEL_UNREACHABLE: ReadonlyArray<FailureCode> = ['MODEL_UNAVAILABLE', 'MODEL_PROVIDER_FAILED']

const SKIPPED = { _tag: 'Skipped', reason: 'neutralized' } as const

const PASSED = { _tag: 'Passed' } as const

const decisionOf = (settle: Settle, command: SettleRecordings): SettleRecordingsDecision =>
  Result.match(settle(command), { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const settledOf = (decision: SettleRecordingsDecision): Settled | undefined =>
  Match.valueTags(decision, { Settled: (settled) => settled, Untouched: () => undefined })

const isUntouched = (decision: SettleRecordingsDecision): boolean =>
  Match.valueTags(decision, { Settled: () => false, Untouched: () => true })

const digestOf = (text: string): KeyDigest => keyDigestOf(CanonicalJson.make(text))

const skippedOf = (step: StepRecord): StepRecord =>
  Match.value(step).pipe(
    Match.tag('ActStep', (record): StepRecord => ({
      _tag: 'ActStep',
      id: record.id,
      instruction: record.instruction,
      params: record.params,
      actions: record.actions,
      summary: record.summary,
      outcome: SKIPPED,
      cache: record.cache,
      modelCalls: record.modelCalls,
      tokens: record.tokens,
    })),
    Match.tag('AssertStep', (record): StepRecord => ({ ...record, outcome: SKIPPED })),
    Match.tag('WaitForStep', (record): StepRecord => ({ ...record, outcome: SKIPPED })),
    Match.tag('ExtractStep', (record): StepRecord => ({ ...record, outcome: SKIPPED })),
    Match.tag('LocatorStep', (record): StepRecord => ({
      _tag: 'LocatorStep',
      id: record.id,
      matcher: record.matcher,
      expected: record.expected,
      observed: record.observed,
      outcome: SKIPPED,
    })),
    Match.tag('ValueStep', (record): StepRecord => ({
      _tag: 'ValueStep',
      id: record.id,
      matcher: record.matcher,
      expected: record.expected,
      observed: record.observed,
      outcome: SKIPPED,
    })),
    Match.exhaustive,
  )

const neutralizedOf = (pool: ReadonlyArray<StepRecord>): ReadonlyArray<StepRecord> => Arr.map(pool, skippedOf)

const valueStepOf = (id: string): StepRecord => ({
  _tag: 'ValueStep',
  id: StepId.make(id),
  matcher: 'pad',
  expected: '',
  observed: '',
  outcome: SKIPPED,
})

const passedLocatorOf = (id: string): StepRecord => ({
  _tag: 'LocatorStep',
  id: StepId.make(id),
  matcher: 'verification',
  expected: '',
  observed: '',
  outcome: PASSED,
})

const verifyPair: ReadonlyArray<StepRecord> = [valueStepOf('pad'), passedLocatorOf('verify')]

const verifiedStepsOf = (pool: ReadonlyArray<StepRecord>): ReadonlyArray<StepRecord> =>
  Arr.appendAll(neutralizedOf(pool), [valueStepOf('pad-a'), valueStepOf('pad-b'), passedLocatorOf('verify')])

const writeStagedOf = (stepIndex: number, digest: KeyDigest, entry: TraceEntry): StagedRecording => ({
  stepIndex,
  digest,
  recording: { _tag: 'Write', entry },
})

const overwriteStagedOf = (
  stepIndex: number,
  digest: KeyDigest,
  entry: TraceEntry,
  existing: TraceEntry,
): StagedRecording => ({
  stepIndex,
  digest,
  recording: { _tag: 'Overwrite', entry, existing },
})

const keepStagedOf = (stepIndex: number, digest: KeyDigest): StagedRecording => ({
  stepIndex,
  digest,
  recording: { _tag: 'Keep' },
})

const outcomeAt = (decision: Settled, stepIndex: number): CacheWrite | undefined =>
  Option.getOrUndefined(
    Option.map(
      Arr.findFirst(decision.outcomes, (outcome) => outcome.stepIndex === stepIndex),
      (outcome) => outcome.write,
    ),
  )

const firstWriteOf = (decision: Settled): EntryWrite | undefined => Option.getOrUndefined(Arr.head(decision.writes))

const isConfirmedWrite = (write: CacheWrite | undefined): boolean =>
  write === 'saved' || write === 'kept' || write === 'not-written'

const wireTextOf = (entry: TraceEntry): string | undefined => Option.getOrUndefined(entryWireTextOf(entry))

const sameWireText = (left: TraceEntry, right: TraceEntry): boolean => {
  const leftText = wireTextOf(left)
  const rightText = wireTextOf(right)
  return leftText !== undefined && rightText !== undefined && leftText === rightText
}

const withAlertsOf = (
  entry: TraceEntry,
  checks: ReadonlyArray<Check>,
  alerts: ReadonlyArray<string>,
): TraceEntry => ({
  schema: 'trace-1',
  keyedBy: entry.keyedBy,
  start: entry.start,
  actions: entry.actions,
  end: entry.end,
  anchors: entry.anchors,
  checks,
  alerts,
  provenance: entry.provenance,
})

it.prop(
  '∀s_SettleRecordings_≡VerifiedNeverUnconfirmed',
  {
    of: [Schema.Array(StepRecord), TraceEntry, TraceEntry, Schema.Int, FailureCodeSchema],
    subject: settleRecordings,
    arbitrary: { seed: 498_031 },
  },
  (subject, [pool, entry, existing, drawn, code]) => {
    const bound = pool.length + 2
    const stagedIndex = Math.abs(drawn) % bound
    const writeStaged = overwriteStagedOf(
      stagedIndex,
      digestOf(`write:${String(stagedIndex)}`),
      entry,
      existing,
    )
    const keepStaged = keepStagedOf(
      (stagedIndex + 1) % bound,
      digestOf(`keep:${String(stagedIndex)}`),
    )
    const command = new SettleRecordings({
      mode: 'read-write',
      ending: { _tag: 'Failed', failure: code },
      steps: verifiedStepsOf(pool),
      staged: [writeStaged, keepStaged],
    })
    const decision = decisionOf(subject, command)
    const settled = settledOf(decision)
    const savedCount = settled === undefined
      ? 0
      : Arr.filter(settled.outcomes, (outcome) => outcome.write === 'saved').length
    const firstWrite = settled === undefined ? undefined : firstWriteOf(settled)
    return settled !== undefined &&
      settled.outcomes.length === 2 &&
      isConfirmedWrite(outcomeAt(settled, writeStaged.stepIndex)) &&
      outcomeAt(settled, keepStaged.stepIndex) === 'kept' &&
      settled.writes.length === savedCount &&
      (firstWrite === undefined ||
        (firstWrite.digest === writeStaged.digest && sameWireText(firstWrite.entry, entry)))
  },
)

it.prop(
  '∀s_SettleRecordings_≡OnlyEdgesVerify',
  {
    of: [
      Schema.Array(StepRecord),
      TraceEntry,
      Schema.Literals(['MODEL_UNAVAILABLE', 'MODEL_PROVIDER_FAILED']),
      Schema.Int,
    ],
    subject: settleRecordings,
    arbitrary: { seed: 498_032 },
  },
  (subject, [pool, entry, code, drawn]) => {
    const bound = pool.length + 2
    const stagedIndex = Math.abs(drawn) % bound
    const writeStaged = writeStagedOf(
      stagedIndex,
      digestOf(`write:${String(stagedIndex)}`),
      entry,
    )
    const keepStaged = keepStagedOf(
      (stagedIndex + 1) % bound,
      digestOf(`keep:${String(stagedIndex)}`),
    )
    const command = new SettleRecordings({
      mode: 'read-write',
      ending: { _tag: 'Failed', failure: code },
      steps: neutralizedOf(pool),
      staged: [writeStaged, keepStaged],
    })
    const decision = decisionOf(subject, command)
    const settled = settledOf(decision)
    return settled !== undefined &&
      settled.outcomes.length === 2 &&
      outcomeAt(settled, writeStaged.stepIndex) === 'unconfirmed' &&
      outcomeAt(settled, keepStaged.stepIndex) === 'unconfirmed' &&
      settled.writes.length === 0 &&
      settled.deletes.length === 0
  },
)

it.prop(
  '∀s_SettleRecordings_≡PassingJudgmentConfirmsItself',
  {
    of: [Schema.Array(StepRecord), CheckRecord, TraceEntry, Schema.Boolean, FailureCodeSchema],
    subject: settleRecordings,
    arbitrary: { seed: 506_031 },
  },
  (subject, [pool, record, entry, waits, code]) => {
    const stagedIndex = pool.length
    const judged = {
      id: StepId.make(record.sentence),
      record,
      outcome: PASSED,
      cache: { lookup: { _tag: 'Missed' }, write: 'unconfirmed' },
      modelCalls: 1,
      tokens: { input: 0, output: 0 },
    } as const
    const judgment: StepRecord = waits ? { _tag: 'WaitForStep', ...judged } : { _tag: 'AssertStep', ...judged }
    const act: StepRecord = {
      _tag: 'ActStep',
      id: StepId.make(record.sentence),
      instruction: record.sentence,
      params: {},
      actions: [],
      summary: record.sentence,
      outcome: PASSED,
      cache: { lookup: { _tag: 'Missed' }, write: 'unconfirmed' },
      modelCalls: 1,
      tokens: { input: 0, output: 0 },
    }
    const settleWith = (last: StepRecord) =>
      settledOf(decisionOf(
        subject,
        new SettleRecordings({
          mode: 'read-write',
          ending: { _tag: 'Failed', failure: code },
          steps: Arr.append(neutralizedOf(pool), last),
          staged: [writeStagedOf(stagedIndex, digestOf(`judgment:${record.sentence}`), entry)],
        }),
      ))
    const byJudgment = settleWith(judgment)
    const byAct = settleWith(act)
    return byJudgment !== undefined &&
      byAct !== undefined &&
      isConfirmedWrite(outcomeAt(byJudgment, stagedIndex)) &&
      outcomeAt(byAct, stagedIndex) === 'unconfirmed'
  },
)

it.prop(
  '∀f_SettleRecordings_¬DeleteOnModelUnreachable',
  {
    of: [Schema.Array(StepRecord), FailureCodeSchema],
    subject: settleRecordings,
    arbitrary: { seed: 498_033 },
  },
  (subject, [pool, code]) => {
    const staged = Arr.map(pool, (step, index) => keepStagedOf(index, digestOf(`keep:${step.id}`)))
    const command = new SettleRecordings({
      mode: 'read-write',
      ending: { _tag: 'Failed', failure: code },
      steps: neutralizedOf(pool),
      staged,
    })
    const decision = decisionOf(subject, command)
    const settled = settledOf(decision)
    const unreachable = Arr.contains(MODEL_UNREACHABLE, code)
    const expectedDeletes = JSON.stringify(Arr.map(staged, (recording) => recording.digest).sort())
    const actualDeletes = settled === undefined
      ? 'not-settled'
      : JSON.stringify(Arr.map(settled.deletes, (digest) => digest).sort())
    return settled !== undefined &&
      settled.outcomes.length === staged.length &&
      Arr.every(settled.outcomes, (outcome) => outcome.write === (unreachable ? 'unconfirmed' : 'evicted')) &&
      (unreachable ? settled.deletes.length === 0 : actualDeletes === expectedDeletes)
  },
)

it.prop(
  '∀s_SettleRecordings_≡InterruptedUntouched',
  { of: [SettleRecordings, Schema.Boolean], subject: settleRecordings, arbitrary: { seed: 498_034 } },
  (subject, [drawn, flip]) => {
    const interrupted = new SettleRecordings({
      mode: drawn.mode,
      ending: { _tag: 'Interrupted' },
      steps: drawn.steps,
      staged: drawn.staged,
    })
    const muted = new SettleRecordings({
      mode: flip ? 'off' : 'read-only',
      ending: drawn.ending,
      steps: drawn.steps,
      staged: drawn.staged,
    })
    return isUntouched(decisionOf(subject, interrupted)) && isUntouched(decisionOf(subject, muted))
  },
)

it.prop(
  '∀e_SettleRecordings_→NotWrittenOverCap',
  {
    of: [TraceEntry, Schema.String, Schema.String],
    subject: settleRecordings,
    runs: 100,
    arbitrary: { seed: 498_035 },
  },
  (subject, [drawn, left, right]) => {
    const slim = withAlertsOf(drawn, [], [])
    const baseBytes = entryWireBytesOf(slim)
    const exact = withAlertsOf(slim, [], ['a'.repeat(WIRE_BYTES_CAP - baseBytes - 2)])
    const over = withAlertsOf(slim, [], ['a'.repeat(WIRE_BYTES_CAP - baseBytes - 1)])
    const overCommand = new SettleRecordings({
      mode: 'read-write',
      ending: { _tag: 'Passed' },
      steps: verifyPair,
      staged: [writeStagedOf(0, digestOf(`over:${left}`), over)],
    })
    const exactCommand = new SettleRecordings({
      mode: 'read-write',
      ending: { _tag: 'Passed' },
      steps: verifyPair,
      staged: [writeStagedOf(0, digestOf(`exact:${right}`), exact)],
    })
    const overDecision = decisionOf(subject, overCommand)
    const exactDecision = decisionOf(subject, exactCommand)
    const overSettled = settledOf(overDecision)
    const exactSettled = settledOf(exactDecision)
    const exactWrite = exactSettled === undefined ? undefined : firstWriteOf(exactSettled)
    return overSettled !== undefined &&
      exactSettled !== undefined &&
      outcomeAt(overSettled, 0) === 'not-written' &&
      overSettled.writes.length === 0 &&
      outcomeAt(exactSettled, 0) === 'saved' &&
      exactWrite !== undefined &&
      exactWrite.digest === digestOf(`exact:${right}`) &&
      sameWireText(exactWrite.entry, exact) &&
      overSettled.deletes.length === 0 &&
      exactSettled.deletes.length === 0
  },
)
