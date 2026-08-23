import { Effect } from 'effect'
import type { Scope } from 'effect'
import type { DaemonHealth } from './DaemonHealth.schema.js'
import type { LockConfig, Worker } from './DaemonSpec.schema.js'
import { worker as workerImpl } from './DaemonWorkerExecutor.js'
import type { LockBinding } from './internal/WithLockByModeExecutor.js'
import { isModeNone } from './LeaderLock.js'
import { LeaderLock } from './LeaderLockAdapter.js'

/**
 * Boots a worker. The leader-lock capability is acquired here, at the composition
 * root, and handed down as part of the lock binding: the executor behind this
 * entry point never sees the tag. A worker whose lock is `{ mode: 'none' }`
 * takes no lock at all.
 */
export const worker: {
  <E, R>(w: Worker<E, R, { mode: 'none' }>): Effect.Effect<
    DaemonHealth,
    never,
    R | Scope.Scope
  >
  <E, R>(w: Worker<E, R, LockConfig>): Effect.Effect<
    DaemonHealth,
    never,
    R | LeaderLock | Scope.Scope
  >
} = <E, R>(
  w: Worker<E, R, LockConfig>,
): Effect.Effect<
  DaemonHealth,
  never,
  R | LeaderLock | Scope.Scope
> =>
  Effect.gen(function*() {
    let binding: LockBinding
    if (isModeNone(w.lock)) {
      binding = { kind: 'unlocked' }
    } else {
      const lock = yield* LeaderLock
      binding = { kind: 'locked', spec: w.lock, lock }
    }
    return yield* workerImpl(w, binding)
  })
