import { it } from '@systemfsoftware/vitest'
import { Equal, Schema } from 'effect'
import { absurd } from 'effect/Function'
import * as Result from 'effect/Result'
import {
  ObservedSpans,
  ReadAbsent,
  ReadSettled,
  ReadStillGrowing,
  ReadUnfinished,
  SettleRemoteRead,
  settleRemoteRead,
  type SettleRemoteReadDecision,
} from '../settle-remote-read.workflow.js'
import { SpanRecord } from '../TraceGraph.schema.js'

type Windows = { readonly settleMillis: number; readonly timeoutMillis: number }

type SettleStep = (
  settlement: ObservedSpans,
  read: ReadonlyArray<SpanRecord>,
  elapsedMillis: number,
  windows: Windows,
) => SettleRemoteReadDecision

const NO_SPANS: ReadonlyArray<SpanRecord> = []
const NEVER_READ: ObservedSpans = { spans: NO_SPANS, addedAtMillis: 0 }
const WINDOWS: Windows = { settleMillis: 10, timeoutMillis: 100 }
const SLOW: Windows = { settleMillis: 500, timeoutMillis: 100 }

const step: SettleStep = (settlement, read, elapsedMillis, windows) =>
  Result.match(
    settleRemoteRead(
      new SettleRemoteRead({
        observed: settlement,
        read,
        elapsedMillis,
        settleMillis: windows.settleMillis,
        timeoutMillis: windows.timeoutMillis,
      }),
    ),
    {
      onFailure: (unreachable: never): SettleRemoteReadDecision => absurd(unreachable),
      onSuccess: (decision): SettleRemoteReadDecision => decision,
    },
  )

const seenAfter = (subject: SettleStep, read: ReadonlyArray<SpanRecord>, windows: Windows): SettleRemoteReadDecision =>
  subject(NEVER_READ, read, 0, windows)

const quietAfter = (
  subject: SettleStep,
  advance: SettleRemoteReadDecision,
  elapsedMillis: number,
  windows: Windows,
): SettleRemoteReadDecision => subject(advance.observation, NO_SPANS, elapsedMillis, windows)

const pollingOf = (outcome: SettleRemoteReadDecision): boolean => Schema.is(ReadStillGrowing)(outcome)
const settledOf = (outcome: SettleRemoteReadDecision): boolean => Schema.is(ReadSettled)(outcome)
const absentOf = (outcome: SettleRemoteReadDecision): boolean => Schema.is(ReadAbsent)(outcome)
const unfinishedOf = (outcome: SettleRemoteReadDecision): boolean => Schema.is(ReadUnfinished)(outcome)

const idsOf = (spans: ReadonlyArray<SpanRecord>): ReadonlySet<string> => new Set(spans.map((span) => span.spanId))

const holdsId = (span: SpanRecord, spans: ReadonlyArray<SpanRecord>): boolean =>
  spans.some((candidate) => candidate.spanId === span.spanId)

const holdsEveryId = (spans: ReadonlyArray<SpanRecord>, of: ReadonlyArray<SpanRecord>): boolean =>
  of.every((span) => holdsId(span, spans))

const sameIds = (left: ReadonlyArray<SpanRecord>, right: ReadonlyArray<SpanRecord>): boolean => {
  const leftIds = idsOf(left)
  const rightIds = idsOf(right)
  return leftIds.size === rightIds.size && [...leftIds].every((id) => rightIds.has(id))
}

const firstWithId = (spans: ReadonlyArray<SpanRecord>, spanId: string): SpanRecord | undefined =>
  spans.find((candidate) => candidate.spanId === spanId)

const keptFirstRecord = (
  spans: ReadonlyArray<SpanRecord>,
  read: ReadonlyArray<SpanRecord>,
  span: SpanRecord,
): boolean => Equal.equals(firstWithId(spans, span.spanId), firstWithId(read, span.spanId))

const unionIsTheDistinctRead = (subject: SettleStep, read: ReadonlyArray<SpanRecord>): boolean =>
  sameIds(seenAfter(subject, read, WINDOWS).observation.spans, read)

const replayAddsNothing = (subject: SettleStep, read: ReadonlyArray<SpanRecord>): boolean => {
  const seen = seenAfter(subject, read, WINDOWS)
  return sameIds(quietAfter(subject, seen, WINDOWS.settleMillis, WINDOWS).observation.spans, seen.observation.spans)
}

const laterReadKeepsEveryEarlierId = (
  subject: SettleStep,
  earlier: ReadonlyArray<SpanRecord>,
  later: ReadonlyArray<SpanRecord>,
): boolean => {
  const union = subject(seenAfter(subject, earlier, WINDOWS).observation, later, WINDOWS.settleMillis, WINDOWS)
    .observation.spans
  return holdsEveryId(union, earlier) && holdsEveryId(union, later)
}

const firstRecordOfEachIdSurvives = (subject: SettleStep, read: ReadonlyArray<SpanRecord>): boolean =>
  read.every((span) => keptFirstRecord(seenAfter(subject, read, WINDOWS).observation.spans, read, span))

const settlesExactlyAtTheWindow = (subject: SettleStep, read: ReadonlyArray<SpanRecord>): boolean => {
  const grown = seenAfter(subject, read, WINDOWS)
  return pollingOf(quietAfter(subject, grown, WINDOWS.settleMillis - 1, WINDOWS)) &&
    settledOf(quietAfter(subject, grown, WINDOWS.settleMillis, WINDOWS))
}

const absenceMeansNothingWasSeen = (subject: SettleStep, read: ReadonlyArray<SpanRecord>): boolean =>
  absentOf(quietAfter(subject, seenAfter(subject, read, WINDOWS), WINDOWS.timeoutMillis, WINDOWS)) ===
    (read.length === 0)

const unfinishedMeansSomethingWasSeen = (subject: SettleStep, read: ReadonlyArray<SpanRecord>): boolean =>
  unfinishedOf(quietAfter(subject, seenAfter(subject, read, SLOW), SLOW.timeoutMillis, SLOW)) === (read.length > 0)

it.prop(
  '∀r_SettleUnion_=DistinctRead',
  { of: [Schema.Array(SpanRecord)], subject: step },
  (subject, [read]) => unionIsTheDistinctRead(subject, read),
)

it.prop(
  '∀r_SettleReplay_≡FirstUnion',
  { of: [Schema.Array(SpanRecord)], subject: step },
  (subject, [read]) => replayAddsNothing(subject, read),
)

it.prop(
  '∀r_SettleShrink_⊇EveryRead',
  { of: [Schema.Array(SpanRecord), Schema.Array(SpanRecord)], subject: step },
  (subject, [earlier, later]) => laterReadKeepsEveryEarlierId(subject, earlier, later),
)

it.prop(
  '∀r_SettleFirstRecord_=FirstSeen',
  { of: [Schema.Array(SpanRecord)], subject: step },
  (subject, [read]) => firstRecordOfEachIdSurvives(subject, read),
)

it.prop(
  '∀r_SettleWindow_=QuietForSettle',
  { of: [Schema.NonEmptyArray(SpanRecord)], subject: step },
  (subject, [read]) => settlesExactlyAtTheWindow(subject, read),
)

it.prop(
  '∀r_SettleVacant_=AbsentAtDeadline',
  { of: [Schema.Array(SpanRecord)], subject: step },
  (subject, [read]) => absenceMeansNothingWasSeen(subject, read),
)

it.prop(
  '∀r_SettleGrowing_=UnfinishedAtDeadline',
  { of: [Schema.Array(SpanRecord)], subject: step },
  (subject, [read]) => unfinishedMeansSomethingWasSeen(subject, read),
)
