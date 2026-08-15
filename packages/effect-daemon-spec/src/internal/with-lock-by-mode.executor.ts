import type { Effect } from 'effect'
import type { LockConfig } from '../daemon-spec.schema.js'
import type { LeaderLock } from '../leader-lock.adapter.js'
import { isModeNone } from '../leader-lock.kernel.js'
import type { LeaderLockAcquireError } from '../leader-lock.schema.js'
import { withLeaderLock } from './with-leader-lock.executor.js'

/**
 * Runs `self` under whichever lock discipline the spec asks for.
 *
 * An absent lock adapter and a `mode: 'none'` spec are one case, not two: a spec that declines
 * the lock and a composition root that supplies no adapter both leave the body unwrapped, and
 * nothing downstream can tell them apart from the effect that comes back. Spelling them as
 * separate arms invites a later edit to give one of them a behaviour the other does not have.
 *
 * The worker and the supervisor make the same choice over the same three cases, so it is made
 * here once rather than in each of them.
 */
export const withLockByMode = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  lockSpec: LockConfig,
  lock: LeaderLock['Type'] | null,
): Effect.Effect<A | void, E | LeaderLockAcquireError, R> => {
  if (lock === null || isModeNone(lockSpec)) {
    return self
  }
  if (lockSpec.mode === 'required') {
    return withLeaderLock(
      self,
      { key: lockSpec.key, mode: 'required', acquireRetryBackoff: lockSpec.acquireRetryBackoff },
      lock,
    )
  }
  return withLeaderLock(self, { key: lockSpec.key, mode: 'optional' }, lock)
}
