import { Schema } from 'effect'

export class SelectionTrace extends Schema.Class<SelectionTrace>('SelectionTrace')({
  taskId: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
  loadedStems: Schema.Array(Schema.String),
  requestedModel: Schema.String,
  servedModel: Schema.String,
  instructionDigest: Schema.String,
  rawResponse: Schema.String,
}) {}

export class UnknownSelectedStem extends Schema.TaggedError<UnknownSelectedStem>()('UnknownSelectedStem', {
  packId: Schema.NonEmptyString,
  stem: Schema.String,
  selected: Schema.Array(Schema.String),
}) {}

export class ProviderFailure extends Schema.TaggedError<ProviderFailure>()('ProviderFailure', {
  role: Schema.String,
  model: Schema.String,
  message: Schema.String,
}) {}

export class AnswerCacheFailure extends Schema.TaggedError<AnswerCacheFailure>()('AnswerCacheFailure', {
  operation: Schema.Literals(['read', 'write']),
  source: Schema.String,
  message: Schema.String,
}) {}

export const SelectionError = Schema.Union([UnknownSelectedStem, ProviderFailure, AnswerCacheFailure])
export type SelectionError = typeof SelectionError.Type

export const TaskGenerationError = Schema.Union([ProviderFailure, AnswerCacheFailure])
export type TaskGenerationError = typeof TaskGenerationError.Type

export const LoadedStems = Schema.Struct({
  loaded: Schema.Array(Schema.String),
})
export type LoadedStems = typeof LoadedStems.Type

export const DimensionTuple = Schema.Record(Schema.String, Schema.String)
export type DimensionTuple = typeof DimensionTuple.Type

export class Dimension extends Schema.Class<Dimension>('Dimension')({
  name: Schema.NonEmptyString,
  captures: Schema.NonEmptyString,
  values: Schema.NonEmptyArray(Schema.NonEmptyString),
}) {}

export const ProposedTuples = Schema.Struct({
  tuples: Schema.Array(DimensionTuple),
})
export type ProposedTuples = typeof ProposedTuples.Type

export const TupleEntry = Schema.Struct({
  name: Schema.NonEmptyString,
  value: Schema.NonEmptyString,
})
export type TupleEntry = typeof TupleEntry.Type

export const ProposedRows = Schema.Struct({
  tuples: Schema.Array(Schema.Array(TupleEntry)),
})
export type ProposedRows = typeof ProposedRows.Type

export const GeneratedTask = Schema.Struct({
  text: Schema.NonEmptyString,
})
export type GeneratedTask = typeof GeneratedTask.Type

export const SelectorAnswer = Schema.Struct({
  loaded: Schema.Array(Schema.String),
  rawResponse: Schema.String,
})
export type SelectorAnswer = typeof SelectorAnswer.Type

export const AnswerCacheFile = Schema.Struct({
  version: Schema.Literal(1),
  entries: Schema.Record(
    Schema.String,
    Schema.Struct({
      servedModel: Schema.String,
      payload: Schema.String,
    }),
  ),
})
export type AnswerCacheFile = typeof AnswerCacheFile.Type
