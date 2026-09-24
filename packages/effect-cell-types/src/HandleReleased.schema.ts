import * as Schema from 'effect/Schema'

export class HandleReleased extends Schema.TaggedError<HandleReleased>()('HandleReleased', {
  handle: Schema.String,
}) {}
