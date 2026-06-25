import { Cause, Effect, Fiber, Match, Metric, Option, Schedule, Scope, Stream } from 'effect'
import type { DaemonHealth } from '../daemon-health.js'
import { healthStateGauge } from '../daemon-metrics.js'
import type {
  PollLoop,
  StreamLoop,
  SubscriptionLoop,
  TickPolicyConfig,
  TickPolicyHooks,
  Worker,
} from '../daemon-spec.js'

const applySpanAttributes = (hooks: TickPolicyHooks) => {
  const { spanAttributes } = hooks
  return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    if (typeof spanAttributes === 'undefined') return effect
    return Effect.tap(effect, () =>
      Effect.orElse(spanAttributes, () => Effect.succeed({})).pipe(
        Effect.flatMap(Effect.annotateCurrentSpan),
      ))
  }
}

const applyTrackDuration = (hooks: TickPolicyHooks) => {
  const { trackDuration } = hooks
  return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    if (typeof trackDuration === 'undefined') return effect
    return Metric.trackDuration(effect, trackDuration)
  }
}

const applyTimeout = (config: typeof TickPolicyConfig.Type) => {
  return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.timeoutFail(effect, {
      duration: config.tickTimeout,
      onTimeout: () => new Cause.TimeoutException(),
    })
}

const applyInnerRetry = (hooks: TickPolicyHooks) => {
  const { innerRetry } = hooks
  return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    if (typeof innerRetry === 'undefined') return effect
    return Effect.retry(effect, innerRetry)
  }
}

const buildPollTick = <E, R>(
  worker: Worker<E, R>,
  health: DaemonHealth,
  gate: Effect.Effect<Option.Option<Effect.Effect<void, E, R>>, E, R>,
): Effect.Effect<void, E | Cause.TimeoutException, R> => {
  const { tick, tickHooks } = worker
  const spanName = tick.spanName ?? 'daemon.tick'
  const withSpanAttrs = applySpanAttributes(tickHooks)
  const withDuration = applyTrackDuration(tickHooks)
  const withTimeout = applyTimeout(tick)
  const withInnerRetry = applyInnerRetry(tickHooks)

  const runWork = (work: Effect.Effect<void, E, R>): Effect.Effect<void, E, R> =>
    work.pipe(withSpanAttrs, withDuration).pipe(
      Effect.withSpan(spanName, { root: true, attributes: { 'daemon.name': worker.name } }),
      Effect.withLogSpan(spanName),
    )

  const gated = Effect.andThen(health.paused.await, gate).pipe(
    Effect.flatMap(Option.match({ onNone: () => Effect.void, onSome: runWork })),
  )
  const timed = withTimeout(gated)
  const retried = withInnerRetry(timed)
  return retried.pipe(
    Effect.tap(() =>
      Effect.zipRight(
        health.ready.open,
        Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', health.name), 'latch', 'ready'), 1),
      )
    ),
    Effect.asVoid,
  )
}

const wrapSpan = <EWorker, EEff, R>(
  worker: Worker<EWorker, R>,
  effect: Effect.Effect<void, EEff, R>,
): Effect.Effect<void, EEff, R> => {
  const spanName = worker.tick.spanName ?? 'daemon.worker'
  return effect.pipe(
    Effect.withSpan(spanName, { root: true, attributes: { 'daemon.name': worker.name } }),
    Effect.withLogSpan(spanName),
  )
}

export const buildPollLoop = <E, R>(
  worker: Worker<E, R>,
  loop: PollLoop<E, R>,
  health: DaemonHealth,
): Effect.Effect<void, E | Cause.TimeoutException, R> => {
  const tick = buildPollTick(worker, health, loop.gate)
  return Effect.repeat(tick, Schedule.spaced(loop.interval)).pipe(Effect.asVoid)
}

export const buildStreamLoop = <E, R>(
  worker: Worker<E, R>,
  loop: StreamLoop<E, R>,
  health: DaemonHealth,
): Effect.Effect<void, E | Cause.TimeoutException, R | Scope.Scope> => {
  const body = Effect.gen(function*() {
    yield* health.paused.await
    const fiber = yield* Effect.forkScoped(
      loop.stream.pipe(
        Stream.tap(() =>
          Effect.zipRight(
            health.ready.open,
            Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', health.name), 'latch', 'ready'), 1),
          )
        ),
        Stream.runDrain,
      ),
    )
    const ready = applyTimeout(worker.tick)(health.ready.await)
    yield* Effect.raceFirst(ready, Fiber.join(fiber))
    yield* Fiber.join(fiber)
  })
  const retried = applyInnerRetry(worker.tickHooks)(body)
  return wrapSpan(worker, retried.pipe(Effect.asVoid))
}

export const buildSubscriptionLoop = <E, R>(
  worker: Worker<E, R>,
  loop: SubscriptionLoop<E, R>,
  health: DaemonHealth,
): Effect.Effect<void, E | Cause.TimeoutException, R> => {
  const body = Effect.gen(function*() {
    yield* health.paused.await
    yield* applyTimeout(worker.tick)(loop.acquire)
    yield* Effect.zipRight(
      health.ready.open,
      Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', health.name), 'latch', 'ready'), 1),
    )
    return yield* Effect.never
  })
  return wrapSpan(worker, body.pipe(Effect.asVoid))
}

export const buildWorkerLoop = <E, R>(
  worker: Worker<E, R>,
  health: DaemonHealth,
): Effect.Effect<void, E | Cause.TimeoutException, R | Scope.Scope> =>
  Match.value(worker.loop).pipe(
    Match.tag('Poll', (loop) => buildPollLoop(worker, loop, health)),
    Match.tag('Stream', (loop) => buildStreamLoop(worker, loop, health)),
    Match.tag('Subscription', (loop) => buildSubscriptionLoop(worker, loop, health)),
    Match.exhaustive,
  )
