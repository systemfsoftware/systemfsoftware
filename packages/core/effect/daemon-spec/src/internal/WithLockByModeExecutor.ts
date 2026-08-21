import type { Effect } from 'effect'
import type { LockConfig } from '../DaemonSpec.schema.js'
import type { LeaderLockAcquireError } from '../LeaderLock.schema.js'
import type { LeaderLock } from '../LeaderLockAdapter.js'
import { withLeaderLock } from './WithLeaderLockExecutor.js'

/**
 * The keyed lock variants of `LockConfig` — `optional` and `required`, both of
 * which carry a `key`. A `{ mode: 'none' }` spec is excluded here rather than
 * paired with a nullable adapter elsewhere.
 */
export type KeyedLockConfig = Exclude<LockConfig, { mode: 'none' }>

/**
 * How a body is bound to the leader lock, decided once at the composition root.
 *
 * `unlocked` is the single case for "this body takes no lock": the spec declined
 * it. `locked` pairs a keyed spec with the adapter that can honour it. The
 * combination "required spec, no adapter" cannot be written in this type, so a
 * later edit cannot give it a silently unwrapping behaviour.
 */
export type LockBinding =
  | { readonly kind: 'unlocked' }
  | { readonly kind: 'locked'; readonly spec: KeyedLockConfig; readonly lock: LeaderLock['Service'] }

/**
 * Runs `self` under whichever lock discipline the binding asks for.
 *
 * An absent lock adapter and a `mode: 'none'` spec are one case, not two: a spec that
 * declines the lock and a composition root that supplies no adapter both leave the
 * body unwrapped, and nothing downstream can tell them apart from the effect that
 * comes back. `unlocked` is that single case; `locked` dispatches on the spec's mode
 * to the existing `withLeaderLock` calls. There is no null arm because the null state
 * is now a constructor choice, not a runtime case.
 *
 * The worker and the supervisor make the same choice over the same cases, so it is
 * made here once rather than in each of them.
 */
export const withLockByMode = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  binding: LockBinding,
): Effect.Effect<A | void, E | LeaderLockAcquireError, R> => {
  if (binding.kind === 'unlocked') {
    return self
  }
  if (binding.spec.mode === 'required') {
    return withLeaderLock(
      self,
      { key: binding.spec.key, mode: 'required', acquireRetryBackoff: binding.spec.acquireRetryBackoff },
      binding.lock,
    )
  }
  return withLeaderLock(self, { key: binding.spec.key, mode: 'optional' }, binding.lock)
}
