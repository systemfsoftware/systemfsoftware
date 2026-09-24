import { Schema } from 'effect'
import { Dimension, DimensionTuple } from './selection-trace.schema.js'

export class TaskDimensions extends Schema.Class<TaskDimensions>('TaskDimensions')({
  version: Schema.Literal(1),
  application: Schema.NonEmptyString,
  dimensions: Schema.NonEmptyArray(Dimension),
  seeds: Schema.Array(DimensionTuple),
}) {}

export class CandidateTask extends Schema.Class<CandidateTask>('CandidateTask')({
  id: Schema.NonEmptyString,
  text: Schema.NonEmptyString,
  dimensions: DimensionTuple,
}) {}

export class CandidateTasks extends Schema.Class<CandidateTasks>('CandidateTasks')({
  version: Schema.Literal(1),
  candidates: Schema.Array(CandidateTask),
}) {}
