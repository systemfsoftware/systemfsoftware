import { Effect, Option, Predicate, type Scope } from 'effect'
import type { DaemonHealth, DynamicHandle, SupervisorHealth } from './daemon-health.js'
import { DaemonReporter } from './daemon-reporter.js'
import type { DynamicSpec, LockConfig, Supervisor, Worker } from './daemon-spec.js'
import { allocateSupervisorHealth, allocateWorkerHealth, bootChild } from './internal/boot.js'
import { buildDynamic } from './internal/dynamic.js'
import { decideLockGate } from './internal/lock-gate.js'
import { buildSupervisorBody } from './internal/supervisor-runtime.js'
import { buildWorkerLoop } from './internal/worker-loop.js'
import { LeaderLock, type LeaderLockAcquireError, withLeaderLock } from './leader-lock.js'

const applyLock = <A, E, R>(
  lock: LockConfig,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A | void, E | LeaderLockAcquireError, R | LeaderLock> => {
  const gate = decideLockGate(lock)
  if (Option.isNone(gate)) return effect
  const locked = withLeaderLock(effect, gate.value)
  if (lock.mode !== 'required') return locked
  const retryWithRestart = (eff: typeof locked): typeof locked =>
    Effect.retry(eff, {
      schedule: lock.acquireRetryBackoff,
      while: Predicate.isTagged('LeaderLockNotAcquired'),
    }).pipe(
      Effect.catchTag('LeaderLockNotAcquired', () => retryWithRestart(eff)),
    )
  return retryWithRestart(locked)
}

const isModeNone = (lock: LockConfig): lock is { mode: 'none' } => lock.mode === 'none'

export function worker<E, R>(
  w: Worker<E, R, { mode: 'none' }>,
): Effect.Effect<DaemonHealth, never, R | DaemonReporter | Scope.Scope>
export function worker<E, R>(
  w: Worker<E, R, LockConfig>,
): Effect.Effect<DaemonHealth, never, R | LeaderLock | DaemonReporter | Scope.Scope>
export function worker<E, R>(
  w: Worker<E, R, LockConfig>,
): Effect.Effect<DaemonHealth, never, R | LeaderLock | DaemonReporter | Scope.Scope> {
  return Effect.gen(function*() {
    const health = yield* allocateWorkerHealth(w.name)
    const loop = buildWorkerLoop(w, health).pipe(Effect.orDie)
    if (isModeNone(w.lock)) {
      yield* Effect.forkScoped(loop)
    } else {
      const locked = applyLock(w.lock, loop)
      yield* Effect.forkScoped(locked.pipe(Effect.orDie))
    }
    return health
  })
}

export function supervisor<E, R>(
  s: Supervisor<E, R, { mode: 'none' }>,
): Effect.Effect<SupervisorHealth, never, R | DaemonReporter | Scope.Scope>
export function supervisor<E, R>(
  s: Supervisor<E, R, LockConfig>,
): Effect.Effect<SupervisorHealth, never, R | LeaderLock | DaemonReporter | Scope.Scope>
export function supervisor<E, R>(
  s: Supervisor<E, R, LockConfig>,
): Effect.Effect<SupervisorHealth, never, R | LeaderLock | DaemonReporter | Scope.Scope> {
  return Effect.gen(function*() {
    const booted = yield* Effect.forEach(s.children, bootChild<E, R>)
    const health = yield* allocateSupervisorHealth(
      s.name,
      booted.map((b) => b.health),
    )
    const body = buildSupervisorBody(s, health, booted).pipe(Effect.orDie)
    if (isModeNone(s.lock)) {
      yield* Effect.forkScoped(body)
    } else {
      const locked = applyLock(s.lock, body)
      yield* Effect.forkScoped(locked.pipe(Effect.orDie))
    }
    return health
  })
}

export const dynamic = <E, R, Args>(
  spec: DynamicSpec<E, R, Args>,
): Effect.Effect<
  DynamicHandle<Args, R | LeaderLock | DaemonReporter | Scope.Scope>,
  never,
  R | LeaderLock | DaemonReporter | Scope.Scope
> =>
  Effect.gen(function*() {
    const health = yield* allocateSupervisorHealth(spec.name, [])
    const handle = yield* buildDynamic(spec, health)
    return handle
  })

export const run = {
  worker,
  supervisor,
  dynamic,
} as const
