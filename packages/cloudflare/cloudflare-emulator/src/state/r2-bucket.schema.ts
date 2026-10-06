import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const R2OutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/R2BucketOutcome')
type R2OutcomeTypeId = typeof R2OutcomeTypeId

export const R2StorageClass = Schema.Literals(['Standard', 'InfrequentAccess'])
export type R2StorageClass = typeof R2StorageClass.Type

export const R2Jurisdiction = Schema.Literals(['default', 'eu', 'us', 'fedramp', 'fedramp-high'])
export type R2Jurisdiction = typeof R2Jurisdiction.Type

export const R2Location = Schema.Literals(['apac', 'eeur', 'enam', 'weur', 'wnam', 'oc'])
export type R2Location = typeof R2Location.Type

export const R2Bucket = Schema.Struct({
  creation_date: Schema.String,
  jurisdiction: R2Jurisdiction,
  location: Schema.optional(R2Location),
  name: Schema.String,
  storage_class: R2StorageClass,
})
export type R2Bucket = typeof R2Bucket.Type

export const R2BucketState = Schema.Array(R2Bucket)
export type R2BucketState = typeof R2BucketState.Type

export class CreateBucket extends Schema.TaggedClass<CreateBucket>()('CreateBucket', {
  name: Schema.String,
  location: Schema.optional(R2Location),
  storage_class: Schema.optional(R2StorageClass),
}) {}

export class ListBuckets extends Schema.TaggedClass<ListBuckets>()('ListBuckets', {
  name_contains: Schema.optional(Schema.String),
  start_after: Schema.optional(Schema.String),
  per_page: Schema.optional(Schema.Finite),
}) {}

export class GetBucket extends Schema.TaggedClass<GetBucket>()('GetBucket', {
  bucket_name: Schema.String,
}) {}

export class CreateBucketByName extends Schema.TaggedClass<CreateBucketByName>()('CreateBucketByName', {
  bucket_name: Schema.String,
  storage_class: Schema.optional(R2StorageClass),
}) {}

export class DeleteBucket extends Schema.TaggedClass<DeleteBucket>()('DeleteBucket', {
  bucket_name: Schema.String,
}) {}

export class PatchBucket extends Schema.TaggedClass<PatchBucket>()('PatchBucket', {
  bucket_name: Schema.String,
  storage_class: R2StorageClass,
}) {}

export const R2Request = Schema.Union([CreateBucket, ListBuckets, GetBucket, CreateBucketByName, DeleteBucket, PatchBucket])
export type R2Request = typeof R2Request.Type

export class R2Applied extends Schema.TaggedClass<R2Applied>()('R2Applied', {
  state: R2BucketState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [R2OutcomeTypeId] = R2OutcomeTypeId
}

export class R2Refused extends Schema.TaggedClass<R2Refused>()('R2Refused', {
  state: R2BucketState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [R2OutcomeTypeId] = R2OutcomeTypeId
}

export const R2Outcome = Schema.Union([R2Applied, R2Refused])
export type R2Outcome = typeof R2Outcome.Type

export class R2Command extends Schema.TaggedClass<R2Command>()('R2Command', {
  now: Schema.String,
  newId: Schema.String,
  state: R2BucketState,
  request: R2Request,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
