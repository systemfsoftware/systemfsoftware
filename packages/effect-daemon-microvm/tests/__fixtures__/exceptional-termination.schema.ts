import { Schema } from 'effect'

export class ExceptionalTermination extends Schema.TaggedError<ExceptionalTermination>()('ExceptionalTermination', {
  observed: Schema.String,
}) {}
