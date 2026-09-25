import { Schema } from 'effect'

export class TransportObservationError
  extends Schema.TaggedError<TransportObservationError>()('TransportObservationError', {
    traceId: Schema.String,
    source: Schema.String,
    detail: Schema.String,
  })
{
  override get message(): string {
    return `The trace store at "${this.source}" could not serve trace "${this.traceId}": ${this.detail}`
  }
}
