import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { SpanRecord } from './TraceGraph.schema.js'

const JudgeTempoAnswerTypeId: unique symbol = Symbol.for('@systemfsoftware/trace-spec/JudgeTempoAnswer')
type JudgeTempoAnswerTypeId = typeof JudgeTempoAnswerTypeId

export class TempoBodyDecoded extends Schema.TaggedClass<TempoBodyDecoded>()('TempoBodyDecoded', {
  spans: Schema.Array(SpanRecord),
  status: Schema.optional(Schema.String),
}) {}

export class TempoBodyUndecodable extends Schema.TaggedClass<TempoBodyUndecodable>()('TempoBodyUndecodable', {
  detail: Schema.String,
}) {}

export const TempoBody = Schema.Union([TempoBodyDecoded, TempoBodyUndecodable])
export type TempoBody = typeof TempoBody.Type

export class TempoAnswerComplete extends Schema.TaggedClass<TempoAnswerComplete>()('TempoAnswerComplete', {
  spans: Schema.Array(SpanRecord),
}) {
  readonly [JudgeTempoAnswerTypeId] = JudgeTempoAnswerTypeId
}

export class TempoAnswerIncomplete extends Schema.TaggedClass<TempoAnswerIncomplete>()('TempoAnswerIncomplete', {
  status: Schema.String,
  spanCount: Schema.Int,
}) {
  readonly [JudgeTempoAnswerTypeId] = JudgeTempoAnswerTypeId
}

export class TempoAnswerUndecodable extends Schema.TaggedClass<TempoAnswerUndecodable>()('TempoAnswerUndecodable', {
  detail: Schema.String,
}) {
  readonly [JudgeTempoAnswerTypeId] = JudgeTempoAnswerTypeId
}

export const TempoAnswerDecision = Schema.Union([TempoAnswerComplete, TempoAnswerIncomplete, TempoAnswerUndecodable])
export type TempoAnswerDecision = typeof TempoAnswerDecision.Type

export class JudgeTempoAnswer extends Schema.TaggedClass<JudgeTempoAnswer>()('JudgeTempoAnswer', {
  body: TempoBody,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const isComplete = (status: Option.Option<string>): boolean =>
  Option.match(status, { onNone: () => true, onSome: (marked) => marked === 'COMPLETE' })

const classify = (spans: ReadonlyArray<SpanRecord>, status: Option.Option<string>): TempoAnswerDecision =>
  Match.value(isComplete(status)).pipe(
    Match.when(true, () => new TempoAnswerComplete({ spans })),
    Match.when(
      false,
      () =>
        new TempoAnswerIncomplete({ status: Option.getOrElse(status, () => 'INCOMPLETE'), spanCount: spans.length }),
    ),
    Match.exhaustive,
  )

const decide = (command: JudgeTempoAnswer): Result.Result<TempoAnswerDecision, never> =>
  Result.succeed(
    Match.value(command.body).pipe(
      Match.tag('TempoBodyDecoded', (decoded) => classify(decoded.spans, Option.fromUndefinedOr(decoded.status))),
      Match.tag('TempoBodyUndecodable', (undecodable) => new TempoAnswerUndecodable({ detail: undecodable.detail })),
      Match.exhaustive,
    ),
  )

export const judgeTempoAnswer = Workflow.make({
  command: JudgeTempoAnswer,
  decision: TempoAnswerDecision,
  error: Schema.Never,
  decide,
})
