import { Effect, Scope } from 'effect'
import type { DaemonHealth } from './DaemonHealth.schema.js'
import { healthStateGauge } from './DaemonMetrics.js'
import type { LockConfig, Worker } from './DaemonSpec.schema.js'
import { allocateWorkerHealth } from './internal/AllocateWorkerHealth.js'
import { buildWorkerLoop } from './internal/BuildWorkerLoop.js'
import { type LockBinding, withLockByMode } from './internal/WithLockByModeExecutor.js'

/** @public */
export const worker = <E, R>(
  w: Worker<E, R, LockConfig>,
  binding: LockBinding,
): Effect.Effect<DaemonHealth, never, R | Scope.Scope> =>
  Effect.gen(function*() {
    const health = yield* allocateWorkerHealth(w.name)
    const loop = buildWorkerLoop(w, health, healthStateGauge).pipe(Effect.orDie)
    const locked = withLockByMode(loop, binding)
    yield* Effect.forkScoped(locked.pipe(Effect.orDie))
    return health
  })
