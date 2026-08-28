import { Schema as S } from 'effect'

/** @public */
export class LockPrimitiveError extends S.TaggedError<LockPrimitiveError>()(
  'LockPrimitiveError',
  { key: S.String, cause: S.Unknown },
) {}
