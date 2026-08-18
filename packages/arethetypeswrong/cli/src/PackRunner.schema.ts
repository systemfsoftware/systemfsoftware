import { Schema } from 'effect'

/** A failed `npm pack`, carrying the spawn failure it came from. */
export class PackRunnerFailed extends Schema.TaggedError<PackRunnerFailed>()('PackRunnerFailed', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
