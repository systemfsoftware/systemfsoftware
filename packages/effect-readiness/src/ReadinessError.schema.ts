import { Schema } from 'effect'

export class LogSourceError extends Schema.TaggedError<LogSourceError>()('LogSourceError', {
  source: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return `log source "${this.source}" failed`
  }
}

/** A probe command failed to decode; the wait's own read built it, so this is a defect it surfaces. */
export class ProbeInputInvalid extends Schema.TaggedError<ProbeInputInvalid>()('ProbeInputInvalid', {
  issue: Schema.String,
}) {
  override get message(): string {
    return `The probe command did not decode: ${this.issue}`
  }
}
