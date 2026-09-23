import { Schema } from 'effect'
import { PatternStatus } from './Verdict.schema.js'

export class EvalMetrics extends Schema.Class<EvalMetrics>('EvalMetrics')({
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
}) {}

export class EvalRecord extends Schema.Class<EvalRecord>('EvalRecord')({
  input: Schema.Json,
  expected: Schema.Boolean,
  status: PatternStatus,
}) {}

export class EvalReport extends Schema.Class<EvalReport>('EvalReport')({
  metrics: EvalMetrics,
  records: Schema.Array(EvalRecord),
}) {}
