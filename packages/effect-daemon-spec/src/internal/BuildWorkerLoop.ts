import {
  Cause,
  Duration,
  Effect,
  Exit,
  Fiber as FiberModule,
  Latch,
  Match,
  Metric,
  Option,
  Schedule,
  Scope,
  Stream,
} from 'effect'

type DaemonHealthShape = {
  readonly name: string
  readonly ready: Latch.Latch
  readonly healthy: Latch.Latch
  readonly paused: Latch.Latch
}

type TickPolicyHooksShape = {
  readonly spanAttributes?: Effect.Effect<Record<string, string | number | boolean>>
  readonly innerRetry?: Schedule.Schedule<unknown>
  readonly trackDuration?: Metric.Histogram<Duration.Duration>
}

type PollLoopShape<E, R> = {
  readonly _tag: 'Poll'
  readonly gate: Effect.Effect<Option.Option<Effect.Effect<void, E, R>>, E, R>
  readonly interval: Duration.Input
}

type StreamLoopShape<E, R> = {
  readonly _tag: 'Stream'
  readonly stream: Stream.Stream<unknown, E, R>
}

type SubscriptionLoopShape<E, R> = {
  readonly _tag: 'Subscription'
  readonly acquire: Effect.Effect<void, E, R>
}
type WorkerShape<_W, E, R> = {
  readonly name: string
  readonly tick: { readonly tickTimeout: Duration.Input; readonly spanName?: string | undefined }
  readonly tickHooks: TickPolicyHooksShape
  readonly loop: PollLoopShape<E, R> | StreamLoopShape<E, R> | SubscriptionLoopShape<E, R>
}

const applySpanAttributes = (hooks: TickPolicyHooksShape) => {
  const { spanAttributes } = hooks
  return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    if (typeof spanAttributes === 'undefined') return effect
    return Effect.tap(effect, () =>
      Effect.orElseSucceed(spanAttributes, () => ({})).pipe(
        Effect.flatMap(Effect.annotateCurrentSpan),
      ))
  }
}

const applyTrackDuration = (hooks: TickPolicyHooksShape) => {
  const { trackDuration } = hooks
  return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    if (typeof trackDuration === 'undefined') return effect
    return Effect.trackDuration(effect, trackDuration)
  }
}

const applyTimeout = (timeout: Duration.Input) => <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.timeout(timeout),
    Effect.catchTag('TimeoutError', () => Effect.fail(new Cause.TimeoutError())),
  )

const applyInnerRetry = (hooks: TickPolicyHooksShape) => {
  const { innerRetry } = hooks
  return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    if (typeof innerRetry === 'undefined') return effect
    return Effect.retry(effect, innerRetry)
  }
}

const openReadyGauge = (gauge: Metric.Gauge<number>, name: string) =>
  Metric.update(Metric.withAttributes(gauge, { daemon: name, latch: 'ready' }), 1)

const buildPollTick = <E, R, W extends WorkerShape<unknown, E, R>>(
  worker: W,
  health: DaemonHealthShape,
  gate: Effect.Effect<Option.Option<Effect.Effect<void, E, R>>, E, R>,
  readyGauge: Metric.Gauge<number>,
): Effect.Effect<void, E | Cause.TimeoutError, R> => {
  const spanName = worker.tick.spanName ?? 'daemon.tick'
  const withSpanAttrs = applySpanAttributes(worker.tickHooks)
  const withDuration = applyTrackDuration(worker.tickHooks)
  const withTimeout = applyTimeout(worker.tick.tickTimeout)
  const withInnerRetry = applyInnerRetry(worker.tickHooks)

  const runWork = (work: Effect.Effect<void, E, R>): Effect.Effect<void, E, R> =>
    work.pipe(
      withSpanAttrs,
      withDuration,
      Effect.withSpan(spanName, { root: true, attributes: { 'daemon.name': worker.name } }),
      Effect.withLogSpan(spanName),
    )

  const gated = Effect.andThen(health.paused.await, gate).pipe(
    Effect.flatMap(Option.match({ onNone: () => Effect.void, onSome: runWork })),
  )
  const timed = withTimeout(gated)
  const retried = withInnerRetry(timed)
  return retried.pipe(
    Effect.tap(() => Effect.andThen(health.ready.open, openReadyGauge(readyGauge, worker.name))),
    Effect.asVoid,
  )
}

const wrapSpan = <_WE, EEff, R, W extends { readonly name: string }>(
  worker: W,
  effect: Effect.Effect<void, EEff, R>,
  spanName?: string,
): Effect.Effect<void, EEff, R> => {
  const finalSpan = spanName ?? 'daemon.worker'
  return effect.pipe(
    Effect.withSpan(finalSpan, { root: true, attributes: { 'daemon.name': worker.name } }),
    Effect.withLogSpan(finalSpan),
  )
}

const buildPollLoop = <E, R, W extends WorkerShape<unknown, E, R>>(
  worker: W,
  loop: PollLoopShape<E, R>,
  health: DaemonHealthShape,
  readyGauge: Metric.Gauge<number>,
): Effect.Effect<void, E | Cause.TimeoutError, R> => {
  const tick = buildPollTick(worker, health, loop.gate, readyGauge)
  return Effect.repeat(tick, Schedule.spaced(loop.interval)).pipe(Effect.asVoid)
}

const propagateExit = <A, Err>(exit: Exit.Exit<A, Err>): Effect.Effect<void, Err, never> =>
  Match.value(exit).pipe(
    Match.tag('Failure', ({ cause }) => Effect.failCause(cause)),
    Match.orElse(() => Effect.void),
  )

const buildStreamLoop = <E, R, W extends WorkerShape<unknown, E, R>>(
  worker: W,
  loop: StreamLoopShape<E, R>,
  health: DaemonHealthShape,
  readyGauge: Metric.Gauge<number>,
): Effect.Effect<void, E | Cause.TimeoutError, R | Scope.Scope> => {
  const body = Effect.gen(function*() {
    yield* health.paused.await
    const fiber = yield* Effect.forkScoped(
      loop.stream.pipe(
        Stream.tap(() => Effect.andThen(health.ready.open, openReadyGauge(readyGauge, worker.name))),
        Stream.runDrain,
      ),
      { startImmediately: true },
    )
    const ready = applyTimeout(worker.tick.tickTimeout)(health.ready.await)
    yield* Effect.raceFirst(ready, FiberModule.await(fiber).pipe(Effect.flatMap(propagateExit)))
    yield* FiberModule.await(fiber).pipe(Effect.flatMap(propagateExit))
  })
  const retried = applyInnerRetry(worker.tickHooks)(body)
  return wrapSpan(worker, retried.pipe(Effect.asVoid))
}

const buildSubscriptionLoop = <E, R, W extends WorkerShape<unknown, E, R>>(
  worker: W,
  loop: SubscriptionLoopShape<E, R>,
  health: DaemonHealthShape,
  readyGauge: Metric.Gauge<number>,
): Effect.Effect<void, E | Cause.TimeoutError, R> => {
  const body = Effect.gen(function*() {
    yield* health.paused.await
    yield* applyTimeout(worker.tick.tickTimeout)(loop.acquire)
    yield* Effect.andThen(health.ready.open, openReadyGauge(readyGauge, worker.name))
    return yield* Effect.never
  })
  return wrapSpan(worker, body.pipe(Effect.asVoid))
}

export const buildWorkerLoop = <E, R>(
  worker: WorkerShape<WorkerShape<unknown, E, R>, E, R>,
  health: DaemonHealthShape,
  readyGauge: Metric.Gauge<number>,
): Effect.Effect<void, E | Cause.TimeoutError, R | Scope.Scope> =>
  Match.value(worker.loop).pipe(
    Match.tag('Poll', (loop) => buildPollLoop(worker, loop, health, readyGauge)),
    Match.tag('Stream', (loop) => buildStreamLoop(worker, loop, health, readyGauge)),
    Match.tag('Subscription', (loop) => buildSubscriptionLoop(worker, loop, health, readyGauge)),
    Match.exhaustive,
  )
