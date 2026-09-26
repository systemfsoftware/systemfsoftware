import { Schema } from 'effect'

export class RuleBroken extends Schema.TaggedError<RuleBroken>()('RuleBroken', {
  message: Schema.String,
}) {}
