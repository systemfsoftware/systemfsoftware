import { Schema } from 'effect'

export class IncompleteObservationError
  extends Schema.TaggedError<IncompleteObservationError>()('IncompleteObservationError', {
    traceId: Schema.String,
    spanCount: Schema.Finite,
    detail: Schema.String,
  })
{}
