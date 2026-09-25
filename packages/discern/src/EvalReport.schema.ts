import { Schema } from 'effect'
import { PatternStatus } from './Verdict.schema.js'

export const EvalMetrics = Schema.Struct({
  total: Schema.Finite,
  decided: Schema.Finite,
  uncertain: Schema.Finite,
  coverage: Schema.Finite,
  correct: Schema.Finite,
  accuracy: Schema.Finite,
  selectiveAccuracy: Schema.Finite,
  truePositive: Schema.Finite,
  falsePositive: Schema.Finite,
  trueNegative: Schema.Finite,
  falseNegative: Schema.Finite,
  precision: Schema.Finite,
  recall: Schema.Finite,
  f1: Schema.Finite,
})
export type EvalMetrics = typeof EvalMetrics.Type

export const EvalRecord = Schema.Struct({
  input: Schema.Json,
  expected: Schema.Boolean,
  status: PatternStatus,
})
export type EvalRecord = typeof EvalRecord.Type

export const EvalReport = Schema.Struct({
  metrics: EvalMetrics,
  records: Schema.Array(EvalRecord),
})
export type EvalReport = typeof EvalReport.Type
