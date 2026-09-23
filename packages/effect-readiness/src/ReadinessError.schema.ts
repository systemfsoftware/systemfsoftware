import { Schema } from 'effect'

export class LogSourceError extends Schema.TaggedError<LogSourceError>()('LogSourceError', {
  source: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

/** A probe command failed to decode; the wait's own read built it, so this is a defect it surfaces. */
export class ProbeInputInvalid extends Schema.TaggedError<ProbeInputInvalid>()('ProbeInputInvalid', {
  issue: Schema.String,
}) {}
