import { Schema } from 'effect'

export class Unavailable extends Schema.TaggedError<Unavailable>()('Unavailable', {
  reason: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return `the capability is unavailable: ${this.reason}`
  }
}
