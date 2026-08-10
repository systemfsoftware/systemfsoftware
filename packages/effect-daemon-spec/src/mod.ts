import { Effect, Layer } from 'effect'
import { poll } from './daemon-poll.combinator.js'
import { DaemonReporter } from './daemon-reporter.adapter.js'
import { stream } from './daemon-stream.combinator.js'
import { subscription } from './daemon-subscription.combinator.js'
import { worker } from './daemon-worker.executor.js'
import { dynamic as dynamicRuntime } from './internal/build-dynamic.executor.js'
import { supervisor, SupervisorBodyExecutorDeps } from './internal/supervisor-body.executor.js'
import { withLeaderLock, WithLeaderLockExecutorDeps } from './internal/with-leader-lock.executor.js'
import { LeaderLock } from './leader-lock/leader-lock.adapter.js'
import { custom } from './supervision-policy/supervision-custom.kernel.js'
import { leader } from './supervision-policy/supervision-leader.combinator.js'
import { task } from './supervision-policy/supervision-task.combinator.js'
import { supervision } from './supervision-policy/supervision-worker.combinator.js'
export { DynamicLimitExceeded } from './daemon-health/daemon-health.schema.js'
export { healthStateGauge } from './daemon-metrics/daemon-metrics.kernel.js'
export {
  BoundedIntensity,
  ChildPolicyConfig,
  Intensity,
  IntensityConfig,
  LockPolicyConfig,
  MaxChildren,
  TickPolicyConfig,
  UnboundedIntensity,
} from './daemon-spec/daemon-policy.schema.js'
export type { LockConfig } from './daemon-spec/daemon-spec.schema.js'
export { LeaderLockNotAcquired } from './leader-lock/leader-lock.schema.js'
export { LockPrimitiveError } from './leader-lock/lock-primitive.schema.js'
export { LeaderConfig } from './supervision-policy/supervision-leader.combinator.js'
export { TaskConfig } from './supervision-policy/supervision-task.combinator.js'
export { WorkerConfig } from './supervision-policy/supervision-worker.combinator.js'
export const Daemon = {
  poll,
  stream,
  subscription,
} as const
export const run = {
  worker,
  supervisor,
  dynamic: dynamicRuntime,
} as const
export const Supervision = {
  leader,
  worker: supervision,
  task,
  custom,
} as const
export { LeaderLock, supervisor, SupervisorBodyExecutorDeps, withLeaderLock, WithLeaderLockExecutorDeps, worker }
export type { LeaderLockOptions } from './internal/with-leader-lock.executor.js'

export const WithLeaderLockExecutorLive: Layer.Layer<WithLeaderLockExecutorDeps, never, LeaderLock> = Layer.effect(
  WithLeaderLockExecutorDeps,
  Effect.gen(function*() {
    const lock = yield* LeaderLock
    return { withLock: lock.withLock }
  }),
)

export const SupervisorBodyExecutorLive: Layer.Layer<SupervisorBodyExecutorDeps, never, DaemonReporter> = Layer.effect(
  SupervisorBodyExecutorDeps,
  Effect.gen(function*() {
    const reporter = yield* DaemonReporter
    return { onRestart: reporter.onRestart, onExhausted: reporter.onExhausted }
  }),
)
