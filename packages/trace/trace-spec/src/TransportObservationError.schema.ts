import { Schema } from 'effect'

export class TransportObservationError
  extends Schema.TaggedError<TransportObservationError>()('TransportObservationError', {
    traceId: Schema.String,
    source: Schema.String,
    detail: Schema.String,
  })
{}
