import { Schema as S } from 'effect'

/** @public */
export class LeaderLockNotAcquired extends S.TaggedError<LeaderLockNotAcquired>()(
  'LeaderLockNotAcquired',
  { key: S.String },
) {}

/** @public */
export class LeaderLockInfraError extends S.TaggedError<LeaderLockInfraError>()(
  'LeaderLockInfraError',
  { key: S.String, cause: S.Unknown },
) {}

/** @public */
export type LeaderLockAcquireError = LeaderLockNotAcquired | LeaderLockInfraError
