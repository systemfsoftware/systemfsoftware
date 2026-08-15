import { Effect, Scope } from 'effect'
import type { DaemonHealth } from './daemon-health.schema.js'
import { healthStateGauge } from './daemon-metrics.kernel.js'
import type { LockConfig, Worker } from './daemon-spec.schema.js'
import { allocateWorkerHealth } from './internal/allocate-worker-health.kernel.js'
import { buildWorkerLoop } from './internal/build-worker-loop.kernel.js'
import { withLeaderLock } from './internal/with-leader-lock.executor.js'
import type { LeaderLock } from './leader-lock.adapter.js'
import { isModeNone } from './leader-lock.kernel.js'
import type { LeaderLockAcquireError } from './leader-lock.schema.js'

export const worker = <E, R>(
  w: Worker<E, R, LockConfig>,
  lock: LeaderLock['Type'] | null,
): Effect.Effect<DaemonHealth, never, R | Scope.Scope> =>
  Effect.gen(function*() {
    const health = yield* allocateWorkerHealth(w.name)
    const loop = buildWorkerLoop(w, health, healthStateGauge).pipe(Effect.orDie)
    let locked: Effect.Effect<void, E | LeaderLockAcquireError, R | Scope.Scope>
    if (lock === null) {
      locked = loop
    } else if (isModeNone(w.lock)) {
      locked = loop
    } else if (w.lock.mode === 'required') {
      locked = withLeaderLock(
        loop,
        {
          key: w.lock.key,
          mode: 'required',
          acquireRetryBackoff: w.lock.acquireRetryBackoff,
        },
        lock,
      )
    } else {
      locked = withLeaderLock(loop, { key: w.lock.key, mode: 'optional' }, lock)
    }
    yield* Effect.forkScoped(locked.pipe(Effect.orDie))
    return health
  })
