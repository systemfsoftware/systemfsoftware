import { Effect, Latch, Metric } from 'effect'
import { healthStateGauge } from '../daemon-metrics.kernel.js'

export const allocateWorkerHealth = (
  name: string,
): Effect.Effect<{
  readonly name: string
  readonly ready: Latch.Latch
  readonly healthy: Latch.Latch
  readonly paused: Latch.Latch
}> =>
  Effect.gen(function*() {
    const ready = yield* Latch.make(false)
    const healthy = yield* Latch.make(true)
    const paused = yield* Latch.make(true)
    yield* Metric.update(Metric.withAttributes(healthStateGauge, { daemon: name, latch: 'ready' }), 0)
    yield* Metric.update(Metric.withAttributes(healthStateGauge, { daemon: name, latch: 'healthy' }), 1)
    yield* Metric.update(Metric.withAttributes(healthStateGauge, { daemon: name, latch: 'paused' }), 1)
    return { name, ready, healthy, paused }
  })
