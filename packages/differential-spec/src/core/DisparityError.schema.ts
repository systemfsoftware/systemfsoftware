import { Schema } from 'effect'

export class DisparityError extends Schema.TaggedError<DisparityError>()('DisparityError', {
  report: Schema.String,
}) {}
