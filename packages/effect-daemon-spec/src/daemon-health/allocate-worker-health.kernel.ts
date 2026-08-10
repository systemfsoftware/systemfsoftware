import { Effect, Metric } from 'effect'
import { healthStateGauge } from '../daemon-metrics/daemon-metrics.kernel.js'

export const allocateWorkerHealth = (
  name: string,
): Effect.Effect<{
  readonly name: string
  readonly ready: Effect.Latch
  readonly healthy: Effect.Latch
  readonly paused: Effect.Latch
}> =>
  Effect.gen(function*() {
    const ready = yield* Effect.makeLatch(false)
    const healthy = yield* Effect.makeLatch(true)
    const paused = yield* Effect.makeLatch(true)
    yield* Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', name), 'latch', 'ready'), 0)
    yield* Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', name), 'latch', 'healthy'), 1)
    yield* Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', name), 'latch', 'paused'), 1)
    return { name, ready, healthy, paused }
  })
