import { Schema } from 'effect'

/**
 * The one defect class: a broken internal invariant is raised through this variant and never
 * through a built-in `Error`. It is a defect, not a typed failure — it carries no `_tag` a
 * caller is meant to dispatch on, and it never appears on a cell's typed error channel.
 */
export class InternalInvariantError extends Schema.TaggedError<InternalInvariantError>()(
  'InternalInvariantError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}
