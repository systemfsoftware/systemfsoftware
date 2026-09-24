import { Schema } from 'effect'

export class ChildFailed extends Schema.TaggedError<ChildFailed>()('ChildFailed', {
  index: Schema.Int,
}) {}
