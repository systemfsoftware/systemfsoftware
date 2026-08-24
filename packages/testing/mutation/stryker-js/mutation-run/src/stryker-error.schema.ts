import { Schema as S } from 'effect'

export class StrykerError extends S.TaggedError<StrykerError>()('StrykerError', {
  message: S.String,
  cause: S.optional(S.Unknown),
}) {}
