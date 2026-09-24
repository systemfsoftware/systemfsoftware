import { Schema } from 'effect'

export class CheckRejected extends Schema.TaggedError<CheckRejected>()('CheckRejected', {
  report: Schema.String,
}) {}
