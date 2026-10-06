import { Schema } from 'effect'

export class HarnessClosed extends Schema.TaggedError<HarnessClosed>()('HarnessClosed', {
  reason: Schema.String,
}) {
  override get message(): string {
    return `the workerd harness is closed: ${this.reason}`
  }
}

export class HarnessStartFailed extends Schema.TaggedError<HarnessStartFailed>()('HarnessStartFailed', {
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return 'the workerd harness could not start'
  }
}

export class HarnessBindingMissing extends Schema.TaggedError<HarnessBindingMissing>()('HarnessBindingMissing', {
  name: Schema.String,
}) {
  override get message(): string {
    return `the workerd harness has no binding named ${this.name}`
  }
}

export class HarnessDispatchFailed extends Schema.TaggedError<HarnessDispatchFailed>()('HarnessDispatchFailed', {
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return 'the request to the workerd Worker failed'
  }
}

export const PlainTextBinding = Schema.TaggedStruct('PlainText', {
  name: Schema.String,
  value: Schema.String,
})
export type PlainTextBinding = typeof PlainTextBinding.Type

export const DurableObjectBinding = Schema.TaggedStruct('DurableObject', {
  name: Schema.String,
  className: Schema.String,
})
export type DurableObjectBinding = typeof DurableObjectBinding.Type

export const WorkerLoaderBinding = Schema.TaggedStruct('WorkerLoader', {
  name: Schema.String,
})
export type WorkerLoaderBinding = typeof WorkerLoaderBinding.Type

export const ServiceBindingReference = Schema.TaggedStruct('Service', {
  name: Schema.String,
  worker: Schema.String,
})
export type ServiceBindingReference = typeof ServiceBindingReference.Type

export const HarnessBinding = Schema.Union([
  PlainTextBinding,
  DurableObjectBinding,
  WorkerLoaderBinding,
  ServiceBindingReference,
])
export type HarnessBinding = typeof HarnessBinding.Type

export const DurableObjectExport = Schema.Struct({
  className: Schema.String,
  storage: Schema.Literals(['sqlite', 'legacy-kv']),
})
export type DurableObjectExport = typeof DurableObjectExport.Type
