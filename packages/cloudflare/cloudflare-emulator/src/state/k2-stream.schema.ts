import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const K2OutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/K2StreamOutcome')
type K2OutcomeTypeId = typeof K2OutcomeTypeId

export const K2Http = Schema.Union([
  Schema.Struct({ enabled: Schema.Literal(false) }),
  Schema.Struct({
    enabled: Schema.Literal(true),
    authentication: Schema.optional(Schema.Boolean),
    cors: Schema.optional(Schema.Struct({ origins: Schema.optional(Schema.Array(Schema.String)) })),
  }),
])
export type K2Http = typeof K2Http.Type

export const K2WorkerBinding = Schema.Union([
  Schema.Struct({ enabled: Schema.Literal(false) }),
  Schema.Struct({ enabled: Schema.Literal(true) }),
])
export type K2WorkerBinding = typeof K2WorkerBinding.Type

export const K2Stream = Schema.Struct({
  created_at: Schema.String,
  endpoint: Schema.String,
  http: K2Http,
  id: Schema.String,
  modified_at: Schema.String,
  name: Schema.String,
  retention_seconds: Schema.Finite,
  worker_binding: K2WorkerBinding,
})
export type K2Stream = typeof K2Stream.Type

export const K2StreamState = Schema.Array(K2Stream)
export type K2StreamState = typeof K2StreamState.Type

export class CreateK2Stream extends Schema.TaggedClass<CreateK2Stream>()('CreateK2Stream', {
  name: Schema.String,
  http: K2Http,
  retention_seconds: Schema.optional(Schema.Finite),
  worker_binding: Schema.optional(K2WorkerBinding),
}) {}

export class ListK2Streams extends Schema.TaggedClass<ListK2Streams>()('ListK2Streams', {
  name: Schema.optional(Schema.String),
  page: Schema.optional(Schema.Finite),
  per_page: Schema.optional(Schema.Finite),
}) {}

export class GetK2Stream extends Schema.TaggedClass<GetK2Stream>()('GetK2Stream', {
  stream_id: Schema.String,
}) {}

export class DeleteK2Stream extends Schema.TaggedClass<DeleteK2Stream>()('DeleteK2Stream', {
  stream_id: Schema.String,
}) {}

export class PatchK2Stream extends Schema.TaggedClass<PatchK2Stream>()('PatchK2Stream', {
  stream_id: Schema.String,
  http: Schema.optional(K2Http),
  retention_seconds: Schema.optional(Schema.Finite),
  worker_binding: Schema.optional(K2WorkerBinding),
}) {}

export class ListK2Subscriptions extends Schema.TaggedClass<ListK2Subscriptions>()('ListK2Subscriptions', {
  stream_id: Schema.String,
}) {}

export const K2Request = Schema.Union([
  CreateK2Stream,
  ListK2Streams,
  GetK2Stream,
  DeleteK2Stream,
  PatchK2Stream,
  ListK2Subscriptions,
])
export type K2Request = typeof K2Request.Type

export class K2Applied extends Schema.TaggedClass<K2Applied>()('K2Applied', {
  state: K2StreamState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [K2OutcomeTypeId] = K2OutcomeTypeId
}

export class K2Refused extends Schema.TaggedClass<K2Refused>()('K2Refused', {
  state: K2StreamState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [K2OutcomeTypeId] = K2OutcomeTypeId
}

export const K2Outcome = Schema.Union([K2Applied, K2Refused])
export type K2Outcome = typeof K2Outcome.Type

export class K2Command extends Schema.TaggedClass<K2Command>()('K2Command', {
  now: Schema.String,
  newId: Schema.String,
  state: K2StreamState,
  request: K2Request,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
