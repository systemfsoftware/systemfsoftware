import { Schema } from 'effect'

export class LogSourceError extends Schema.TaggedError<LogSourceError>()('LogSourceError', {
  source: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
