import { Effect, Metric } from 'effect'
import type { Scope } from 'effect'
import type { DaemonHealth, SupervisorHealth } from '../daemon-health.js'
import { healthStateGauge } from '../daemon-metrics.js'
import { ChildPolicyConfig } from '../daemon-policy.schema.js'
import type { DaemonReporter } from '../daemon-reporter.js'
import type { Child } from '../daemon-spec.js'
import { isWorker } from '../daemon-spec.js'
import { buildSupervisorBody } from './supervisor-runtime.js'
import { buildWorkerLoop } from './worker-loop.js'

export interface BootedChild<R> {
  readonly name: string
  readonly health: DaemonHealth | SupervisorHealth
  readonly run: Effect.Effect<void, never, R>
  readonly childPolicy: typeof ChildPolicyConfig.Type
}

export const allocateWorkerHealth = (name: string): Effect.Effect<DaemonHealth> =>
  Effect.gen(function*() {
    const ready = yield* Effect.makeLatch(false)
    const healthy = yield* Effect.makeLatch(true)
    const paused = yield* Effect.makeLatch(true)
    yield* Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', name), 'latch', 'ready'), 0)
    yield* Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', name), 'latch', 'healthy'), 1)
    yield* Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', name), 'latch', 'paused'), 1)
    return { name, ready, healthy, paused }
  })

export const allocateSupervisorHealth = (
  name: string,
  children: ReadonlyArray<DaemonHealth | SupervisorHealth>,
): Effect.Effect<SupervisorHealth> =>
  Effect.gen(function*() {
    const ready = yield* Effect.makeLatch(false)
    const healthy = yield* Effect.makeLatch(true)
    const paused = yield* Effect.makeLatch(true)
    yield* Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', name), 'latch', 'ready'), 0)
    yield* Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', name), 'latch', 'healthy'), 1)
    yield* Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', name), 'latch', 'paused'), 1)
    return { name, ready, healthy, paused, children }
  })

export const bootChild = <E, R>(
  child: Child<E, R>,
): Effect.Effect<BootedChild<R | DaemonReporter | Scope.Scope>, never, R> => {
  if (isWorker(child)) {
    return allocateWorkerHealth(child.name).pipe(
      Effect.map((health) => ({
        name: child.name,
        health,
        run: buildWorkerLoop(child, health).pipe(Effect.orDie),
        childPolicy: child.child,
      })),
    )
  }
  return Effect.gen(function*() {
    const bootedChildren = yield* Effect.forEach(child.children, bootChild<E, R>)
    const health = yield* allocateSupervisorHealth(
      child.name,
      bootedChildren.map((b) => b.health),
    )
    const run = buildSupervisorBody(child, health, bootedChildren).pipe(Effect.orDie)
    return { name: child.name, health, run, childPolicy: {} }
  })
}
