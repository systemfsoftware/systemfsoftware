import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { SpanRecord } from './TraceGraph.schema.js'

const SettleRemoteReadTypeId: unique symbol = Symbol.for('@systemfsoftware/trace-spec/SettleRemoteRead')
type SettleRemoteReadTypeId = typeof SettleRemoteReadTypeId

export const ObservedSpans = Schema.Struct({
  spans: Schema.Array(SpanRecord),
  addedAtMillis: Schema.Finite,
})
export type ObservedSpans = typeof ObservedSpans.Type

export class ReadSettled extends Schema.TaggedClass<ReadSettled>()('ReadSettled', {
  observation: ObservedSpans,
}) {
  readonly [SettleRemoteReadTypeId] = SettleRemoteReadTypeId
}

export class ReadAbsent extends Schema.TaggedClass<ReadAbsent>()('ReadAbsent', {
  observation: ObservedSpans,
}) {
  readonly [SettleRemoteReadTypeId] = SettleRemoteReadTypeId
}

export class ReadUnfinished extends Schema.TaggedClass<ReadUnfinished>()('ReadUnfinished', {
  observation: ObservedSpans,
}) {
  readonly [SettleRemoteReadTypeId] = SettleRemoteReadTypeId
}

export class ReadStillGrowing extends Schema.TaggedClass<ReadStillGrowing>()('ReadStillGrowing', {
  observation: ObservedSpans,
}) {
  readonly [SettleRemoteReadTypeId] = SettleRemoteReadTypeId
}

export const SettleRemoteReadDecision = Schema.Union([ReadSettled, ReadAbsent, ReadUnfinished, ReadStillGrowing])
export type SettleRemoteReadDecision = typeof SettleRemoteReadDecision.Type

export class SettleRemoteRead extends Schema.TaggedClass<SettleRemoteRead>()('SettleRemoteRead', {
  observed: ObservedSpans,
  read: Schema.Array(SpanRecord),
  elapsedMillis: Schema.Finite,
  settleMillis: Schema.Finite,
  timeoutMillis: Schema.Finite,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const sameId = (left: SpanRecord, right: SpanRecord): boolean => left.spanId === right.spanId

const firstOfEachId = (read: ReadonlyArray<SpanRecord>): ReadonlyArray<SpanRecord> => Arr.dedupeWith(read, sameId)

const freshOf = (observed: ObservedSpans, read: ReadonlyArray<SpanRecord>): ReadonlyArray<SpanRecord> =>
  Arr.filter(firstOfEachId(read), (span) => Arr.every(observed.spans, (seen) => seen.spanId !== span.spanId))

const absorbed = (observed: ObservedSpans, read: ReadonlyArray<SpanRecord>, elapsedMillis: number): ObservedSpans => {
  const fresh = freshOf(observed, read)
  return Option.match(Arr.head(fresh), {
    onNone: () => observed,
    onSome: () => ({ spans: [...observed.spans, ...fresh], addedAtMillis: elapsedMillis }),
  })
}

const quietForLongEnough = (observed: ObservedSpans, elapsedMillis: number, settleMillis: number): boolean =>
  Arr.every([observed.spans.length > 0, elapsedMillis - observed.addedAtMillis >= settleMillis], Boolean)

const classify = (
  observation: ObservedSpans,
  elapsedMillis: number,
  settleMillis: number,
  timeoutMillis: number,
): SettleRemoteReadDecision =>
  Match.value(quietForLongEnough(observation, elapsedMillis, settleMillis)).pipe(
    Match.when(true, () => new ReadSettled({ observation })),
    Match.when(false, () =>
      Match.value(elapsedMillis >= timeoutMillis).pipe(
        Match.when(true, () =>
          Match.value(observation.spans.length === 0).pipe(
            Match.when(true, () => new ReadAbsent({ observation })),
            Match.when(false, () => new ReadUnfinished({ observation })),
            Match.exhaustive,
          )),
        Match.when(false, () => new ReadStillGrowing({ observation })),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const decide = (command: SettleRemoteRead): Result.Result<SettleRemoteReadDecision, never> =>
  Result.succeed(
    classify(
      absorbed(command.observed, command.read, command.elapsedMillis),
      command.elapsedMillis,
      command.settleMillis,
      command.timeoutMillis,
    ),
  )

export const settleRemoteRead = Workflow.make({
  command: SettleRemoteRead,
  decision: SettleRemoteReadDecision,
  error: Schema.Never,
  decide,
})
