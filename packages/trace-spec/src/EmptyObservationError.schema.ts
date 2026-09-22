import { Schema } from 'effect'

export class EmptyObservationError extends Schema.TaggedError<EmptyObservationError>()('EmptyObservationError', {
  traceId: Schema.String,
  detail: Schema.String,
}) {}
