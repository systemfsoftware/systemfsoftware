import { Schema as S } from 'effect'

export class LockPrimitiveError extends S.TaggedError<LockPrimitiveError>()(
  'LockPrimitiveError',
  { key: S.String, cause: S.Unknown },
) {}
