import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const PipelinesOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/PipelinesSinkOutcome')
type PipelinesOutcomeTypeId = typeof PipelinesOutcomeTypeId

export const SinkType = Schema.Literals(['r2', 'r2_data_catalog', 'basin_catalog'])
export type SinkType = typeof SinkType.Type

export const PipelinesSink = Schema.Struct({
  created_at: Schema.String,
  id: Schema.String,
  modified_at: Schema.String,
  name: Schema.String,
  type: SinkType,
})
export type PipelinesSink = typeof PipelinesSink.Type

export const PipelinesSinkState = Schema.Array(PipelinesSink)
export type PipelinesSinkState = typeof PipelinesSinkState.Type

export class CreateSink extends Schema.TaggedClass<CreateSink>()('CreateSink', {
  name: Schema.String,
  type: SinkType,
}) {}

export class CreateSinkWithoutBody extends Schema.TaggedClass<CreateSinkWithoutBody>()('CreateSinkWithoutBody', {}) {}

export class ListSinks extends Schema.TaggedClass<ListSinks>()('ListSinks', {
  name: Schema.optional(Schema.String),
  page: Schema.optional(Schema.Finite),
  per_page: Schema.optional(Schema.Finite),
}) {}

export class GetSink extends Schema.TaggedClass<GetSink>()('GetSink', {
  sink_id: Schema.String,
}) {}

export class DeleteSink extends Schema.TaggedClass<DeleteSink>()('DeleteSink', {
  sink_id: Schema.String,
}) {}

export const PipelinesRequest = Schema.Union([CreateSink, CreateSinkWithoutBody, ListSinks, GetSink, DeleteSink])
export type PipelinesRequest = typeof PipelinesRequest.Type

export class PipelinesApplied extends Schema.TaggedClass<PipelinesApplied>()('PipelinesApplied', {
  state: PipelinesSinkState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [PipelinesOutcomeTypeId] = PipelinesOutcomeTypeId
}

export class PipelinesRefused extends Schema.TaggedClass<PipelinesRefused>()('PipelinesRefused', {
  state: PipelinesSinkState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [PipelinesOutcomeTypeId] = PipelinesOutcomeTypeId
}

export const PipelinesOutcome = Schema.Union([PipelinesApplied, PipelinesRefused])
export type PipelinesOutcome = typeof PipelinesOutcome.Type

export class PipelinesCommand extends Schema.TaggedClass<PipelinesCommand>()('PipelinesCommand', {
  now: Schema.String,
  newId: Schema.String,
  state: PipelinesSinkState,
  request: PipelinesRequest,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
