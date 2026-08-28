import { Schema as S } from 'effect'

/** @public */
export class StrykerError extends S.TaggedError<StrykerError>()('StrykerError', {
  message: S.String,
  cause: S.optional(S.Unknown),
}) {}
