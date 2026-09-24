import { Schema } from 'effect'

export class InternalInvariantError extends Schema.TaggedError<InternalInvariantError>()(
  'InternalInvariantError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}
