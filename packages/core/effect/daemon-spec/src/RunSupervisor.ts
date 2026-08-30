import { Effect } from 'effect'
import type { Scope } from 'effect'
import type { SupervisorHealth } from './DaemonHealth.schema.js'
import { DaemonReporter } from './DaemonReporterAdapter.js'
import type { LockConfig, Supervisor } from './DaemonSpec.schema.js'
import { supervisor as supervisorImpl } from './internal/SupervisorBodyExecutor.js'
import type { LockBinding } from './internal/WithLockByModeExecutor.js'
import { isModeNone } from './LeaderLock.js'
import { LeaderLock } from './LeaderLockAdapter.js'

/**
 * The supervisor: acquires the `DaemonReporter` and — unless the lock mode is none —
 * the `LeaderLock` capabilities at the composition root, then hands them down to the
 * supervisor body via the lock binding. The body itself only ever sees the service
 * values.
 * @public
 */
export const supervisor = <E, R>(
  s: Supervisor<E, R, LockConfig>,
): Effect.Effect<
  SupervisorHealth,
  never,
  R | DaemonReporter | LeaderLock | Scope.Scope
> =>
  Effect.gen(function*() {
    const reporter = yield* DaemonReporter
    let binding: LockBinding
    if (isModeNone(s.lock)) {
      binding = { kind: 'unlocked' }
    } else {
      const lock = yield* LeaderLock
      binding = { kind: 'locked', spec: s.lock, lock }
    }
    return yield* supervisorImpl(s, reporter, binding)
  })
