import { Schema as S } from 'effect'

export class LeaderLockNotAcquired extends S.TaggedError<LeaderLockNotAcquired>()(
  'LeaderLockNotAcquired',
  { key: S.String },
) {}

export class LeaderLockInfraError extends S.TaggedError<LeaderLockInfraError>()(
  'LeaderLockInfraError',
  { key: S.String, cause: S.Unknown },
) {}

export type LeaderLockAcquireError = LeaderLockNotAcquired | LeaderLockInfraError
