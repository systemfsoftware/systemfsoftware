import { Effect, Scope } from 'effect'
import type { DaemonHealth } from './daemon-health.schema.js'
import { healthStateGauge } from './daemon-metrics.kernel.js'
import type { LockConfig, Worker } from './daemon-spec.schema.js'
import { allocateWorkerHealth } from './internal/allocate-worker-health.kernel.js'
import { buildWorkerLoop } from './internal/build-worker-loop.kernel.js'
import { withLockByMode } from './internal/with-lock-by-mode.executor.js'
import type { LeaderLock } from './leader-lock.adapter.js'

export const worker = <E, R>(
  w: Worker<E, R, LockConfig>,
  lock: LeaderLock['Type'] | null,
): Effect.Effect<DaemonHealth, never, R | Scope.Scope> =>
  Effect.gen(function*() {
    const health = yield* allocateWorkerHealth(w.name)
    const loop = buildWorkerLoop(w, health, healthStateGauge).pipe(Effect.orDie)
    const locked = withLockByMode(loop, w.lock, lock)
    yield* Effect.forkScoped(locked.pipe(Effect.orDie))
    return health
  })
