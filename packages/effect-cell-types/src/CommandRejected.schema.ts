import * as Schema from 'effect/Schema'

export class CommandRejected extends Schema.TaggedError<CommandRejected>()('CommandRejected', {
  issue: Schema.String,
}) {}
