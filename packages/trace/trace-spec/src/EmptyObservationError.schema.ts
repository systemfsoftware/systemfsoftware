import { Schema } from 'effect'

export class EmptyObservationError
  extends Schema.TaggedError<EmptyObservationError, { readonly brand: unique symbol }>()('EmptyObservationError', {
    traceId: Schema.String,
    detail: Schema.String,
  })
{
  override get message(): string {
    return `Trace "${this.traceId}" recorded no spans: ${this.detail}`
  }
}
