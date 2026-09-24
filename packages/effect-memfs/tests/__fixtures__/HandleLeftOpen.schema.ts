import { Schema } from 'effect'

export class HandleLeftOpen extends Schema.TaggedError<HandleLeftOpen>()('HandleLeftOpen', {
  reason: Schema.String,
}) {}
