import { Context, Effect, Scope } from 'effect'
import { allocateWorkerHealth } from './daemon-health/allocate-worker-health.kernel.js'
import type { DaemonHealth } from './daemon-health/daemon-health.schema.js'
import { healthStateGauge } from './daemon-metrics/daemon-metrics.kernel.js'
import type { DaemonReporter } from './daemon-reporter/daemon-reporter.adapter.js'
import type { LockConfig, Worker } from './daemon-spec/daemon-spec.schema.js'
import { buildWorkerLoop } from './internal/build-worker-loop.kernel.js'
import { withLeaderLock, WithLeaderLockExecutorDeps } from './internal/with-leader-lock.executor.js'
import type { LeaderLock } from './leader-lock/leader-lock.adapter.js'
import { isModeNone } from './leader-lock/leader-lock.kernel.js'
import type { LeaderLockAcquireError } from './leader-lock/leader-lock.schema.js'

export interface DaemonWorkerExecutorDepsService {
  readonly withLock: LeaderLock['Type']['withLock']
  readonly onRestart: DaemonReporter['Type']['onRestart']
  readonly onExhausted: DaemonReporter['Type']['onExhausted']
}

export class DaemonWorkerExecutorDeps extends Context.Tag(
  '@systemfsoftware/effect-daemon-spec/daemon-worker.executor/DaemonWorkerExecutorDeps',
)<DaemonWorkerExecutorDeps, DaemonWorkerExecutorDepsService>() {}

export const worker: {
  <E, R>(w: Worker<E, R, { mode: 'none' }>): Effect.Effect<
    DaemonHealth,
    never,
    R | Scope.Scope
  >
  <E, R>(w: Worker<E, R, LockConfig>): Effect.Effect<
    DaemonHealth,
    never,
    R | WithLeaderLockExecutorDeps | Scope.Scope
  >
} = <E, R>(
  w: Worker<E, R, LockConfig>,
): Effect.Effect<
  DaemonHealth,
  never,
  R | WithLeaderLockExecutorDeps | Scope.Scope
> =>
  Effect.gen(function*() {
    const health = yield* allocateWorkerHealth(w.name)
    const loop = buildWorkerLoop(w, health, healthStateGauge).pipe(Effect.orDie)
    const lockNone = isModeNone(w.lock)
    const required = !lockNone && w.lock.mode === 'required'
    let locked: Effect.Effect<void, E | LeaderLockAcquireError, R | WithLeaderLockExecutorDeps | Scope.Scope>
    if (lockNone) {
      locked = loop
    } else if (required) {
      locked = withLeaderLock(loop, {
        key: w.lock.key,
        mode: 'required',
        acquireRetryBackoff: w.lock.acquireRetryBackoff,
      })
    } else {
      locked = withLeaderLock(loop, { key: w.lock.key, mode: 'optional' })
    }
    yield* Effect.forkScoped(locked.pipe(Effect.orDie))
    return health
  })
