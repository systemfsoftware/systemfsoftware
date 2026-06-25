import type { Cause } from 'effect'
import { Effect, Exit, type Fiber, Metric } from 'effect'
import type { SupervisorHealth } from '../daemon-health.js'
import { healthStateGauge } from '../daemon-metrics.js'
import type { DaemonReporter } from '../daemon-reporter.js'
import type { SupervisionPolicy } from '../supervision-preset.js'
import type { BootedChild } from './boot.js'
import type { IntensityTracker } from './intensity.js'

export interface SupervisionContext<R> {
  readonly name: string
  readonly booted: ReadonlyArray<BootedChild<R>>
  readonly health: SupervisorHealth
  readonly policy: SupervisionPolicy
  readonly reportRestart: (cause: Cause.Cause<never>) => Effect.Effect<void, never, DaemonReporter>
  readonly reportExhausted: (cause: Cause.Cause<never>) => Effect.Effect<void, never, DaemonReporter>
  readonly intensityEff: Effect.Effect<IntensityTracker>
}

export const openAllReady = <R>(ctx: SupervisionContext<R>) =>
  Effect.gen(function*() {
    yield* Effect.yieldNow()
    yield* Effect.forEach(ctx.booted, (b) => b.health.ready.await, { concurrency: 'unbounded' })
    yield* Effect.zipRight(
      ctx.health.ready.open,
      Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', ctx.name), 'latch', 'ready'), 1),
    )
  })

export const raceForExit = <A, E>(
  fibers: ReadonlyArray<Fiber.RuntimeFiber<A, E>>,
): Effect.Effect<readonly [number, Exit.Exit<A, E>]> =>
  Effect.raceAll(
    fibers.map((f, idx) =>
      f.await.pipe(
        Effect.map((exit): readonly [number, Exit.Exit<A, E>] => [idx, exit]),
      )
    ),
  )

export type Supervision<R> = Effect.Effect<
  void,
  never,
  R | DaemonReporter | import('effect').Scope.Scope
>
