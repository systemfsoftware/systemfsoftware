import { Schema } from 'effect'

export class UnreadableSource extends Schema.TaggedError<UnreadableSource>()('UnreadableSource', {
  path: Schema.String,
  message: Schema.String,
}) {}
