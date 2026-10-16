import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { PatternStatus } from './Verdict.schema.js'

const EvalScoreTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/EvalScore')
type EvalScoreTypeId = typeof EvalScoreTypeId

export class TruePositive extends Schema.TaggedClass<TruePositive>()('TruePositive', {}) {
  readonly [EvalScoreTypeId] = EvalScoreTypeId
}

export class FalsePositive extends Schema.TaggedClass<FalsePositive>()('FalsePositive', {}) {
  readonly [EvalScoreTypeId] = EvalScoreTypeId
}

export class TrueNegative extends Schema.TaggedClass<TrueNegative>()('TrueNegative', {}) {
  readonly [EvalScoreTypeId] = EvalScoreTypeId
}

export class FalseNegative extends Schema.TaggedClass<FalseNegative>()('FalseNegative', {}) {
  readonly [EvalScoreTypeId] = EvalScoreTypeId
}

export class Abstained extends Schema.TaggedClass<Abstained>()('Abstained', {}) {
  readonly [EvalScoreTypeId] = EvalScoreTypeId
}

export const EvalScore = Schema.Union([TruePositive, FalsePositive, TrueNegative, FalseNegative, Abstained])
export type EvalScore = typeof EvalScore.Type

export class ScoreEvalRecord extends Schema.TaggedClass<ScoreEvalRecord>()('ScoreEvalRecord', {
  expected: Schema.Boolean,
  status: PatternStatus,
}) {
  static readonly [Workflow.InstrumentationBrand] = {
    expected: 'app.discern.score-eval-record.expected',
  } as const
}

const positiveCell = (expected: boolean): EvalScore =>
  Match.value(expected).pipe(
    Match.when(true, () => new TruePositive({})),
    Match.when(false, () => new FalsePositive({})),
    Match.exhaustive,
  )

const negativeCell = (expected: boolean): EvalScore =>
  Match.value(expected).pipe(
    Match.when(true, () => new FalseNegative({})),
    Match.when(false, () => new TrueNegative({})),
    Match.exhaustive,
  )

const cellOf = (expected: boolean, status: PatternStatus): EvalScore =>
  Match.value(status).pipe(
    Match.when('Uncertain', () => new Abstained({})),
    Match.when('Match', () => positiveCell(expected)),
    Match.when('Miss', () => negativeCell(expected)),
    Match.exhaustive,
  )

export const scoreEvalRecord = Workflow.make({
  command: ScoreEvalRecord,
  decision: EvalScore,
  error: Schema.Never,
  decide: ({ expected, status }): Result.Result<EvalScore, never> => Result.succeed(cellOf(expected, status)),
})
