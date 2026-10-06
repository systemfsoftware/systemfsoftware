import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const DestinationOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/DestinationOutcome')
type DestinationOutcomeTypeId = typeof DestinationOutcomeTypeId

export const DestinationDataset = Schema.Literals([
  'opentelemetry-traces',
  'opentelemetry-logs',
  'opentelemetry-metrics',
])
export type DestinationDataset = typeof DestinationDataset.Type

export const DestinationHeaders = Schema.Record(Schema.String, Schema.String)
export type DestinationHeaders = typeof DestinationHeaders.Type

export const DestinationJobStatus = Schema.Struct({
  error_message: Schema.String,
  last_complete: Schema.String,
  last_error: Schema.String,
})
export type DestinationJobStatus = typeof DestinationJobStatus.Type

export const ObservabilityDestination = Schema.Struct({
  account_id: Schema.String,
  configuration: Schema.Struct({
    destination_conf: Schema.String,
    headers: DestinationHeaders,
    jobStatus: DestinationJobStatus,
    logpushDataset: DestinationDataset,
    logpushJob: Schema.Finite,
    type: Schema.Literal('logpush'),
    url: Schema.String,
  }),
  created: Schema.String,
  enabled: Schema.Boolean,
  name: Schema.String,
  scripts: Schema.Array(Schema.String),
  slug: Schema.String,
  updated: Schema.String,
})
export type ObservabilityDestination = typeof ObservabilityDestination.Type

export const ObservabilityDestinationState = Schema.Array(ObservabilityDestination)
export type ObservabilityDestinationState = typeof ObservabilityDestinationState.Type

export const emptyObservabilityDestinationState: ObservabilityDestinationState = []

export class ListDestinations extends Schema.TaggedClass<ListDestinations>()('ListDestinations', {
  account_id: Schema.String,
  order: Schema.optional(Schema.Literals(['asc', 'desc'])),
  orderBy: Schema.optional(Schema.Literals(['created', 'updated'])),
  page: Schema.optional(Schema.Finite),
  perPage: Schema.optional(Schema.Finite),
}) {}

export const CreateDestinationInput = Schema.Struct({
  configuration: Schema.Struct({
    headers: DestinationHeaders,
    logpushDataset: DestinationDataset,
    type: Schema.Literal('logpush'),
    url: Schema.String,
  }),
  enabled: Schema.Boolean,
  name: Schema.String,
  skipPreflightCheck: Schema.optional(Schema.Boolean),
})
export type CreateDestinationInput = typeof CreateDestinationInput.Type

export const UpdateDestinationInput = Schema.Struct({
  configuration: Schema.Struct({
    headers: DestinationHeaders,
    type: Schema.Literal('logpush'),
    url: Schema.String,
  }),
  enabled: Schema.Boolean,
})
export type UpdateDestinationInput = typeof UpdateDestinationInput.Type

export class CreateDestination extends Schema.TaggedClass<CreateDestination>()('CreateDestination', {
  account_id: Schema.String,
  body: CreateDestinationInput,
}) {}

export class UpdateDestination extends Schema.TaggedClass<UpdateDestination>()('UpdateDestination', {
  account_id: Schema.String,
  body: UpdateDestinationInput,
  slug: Schema.String,
}) {}

export class DeleteDestination extends Schema.TaggedClass<DeleteDestination>()('DeleteDestination', {
  account_id: Schema.String,
  slug: Schema.String,
}) {}

export const DestinationRequest = Schema.Union([
  ListDestinations,
  CreateDestination,
  UpdateDestination,
  DeleteDestination,
])
export type DestinationRequest = typeof DestinationRequest.Type

export class DestinationApplied extends Schema.TaggedClass<DestinationApplied>()('DestinationApplied', {
  body: Schema.Json,
  state: ObservabilityDestinationState,
  status: Schema.Finite,
}) {
  readonly [DestinationOutcomeTypeId] = DestinationOutcomeTypeId
}

export class DestinationRefused extends Schema.TaggedClass<DestinationRefused>()('DestinationRefused', {
  body: Schema.Json,
  state: ObservabilityDestinationState,
  status: Schema.Finite,
}) {
  readonly [DestinationOutcomeTypeId] = DestinationOutcomeTypeId
}

export const DestinationOutcome = Schema.Union([DestinationApplied, DestinationRefused])
export type DestinationOutcome = typeof DestinationOutcome.Type

export class DestinationCommand extends Schema.TaggedClass<DestinationCommand>()('DestinationCommand', {
  newId: Schema.String,
  now: Schema.String,
  request: DestinationRequest,
  state: ObservabilityDestinationState,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
