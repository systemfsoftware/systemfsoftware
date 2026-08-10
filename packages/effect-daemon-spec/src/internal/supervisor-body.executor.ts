import { Array as Arr, Cause, Context, Effect, Either, Exit, Fiber, Match, Metric, Option, Ref, Schedule } from 'effect'
import type { Scope } from 'effect'
import { allocateSupervisorHealth } from '../daemon-health/allocate-supervisor-health.kernel.js'
import { allocateWorkerHealth } from '../daemon-health/allocate-worker-health.kernel.js'
import type { SupervisorHealth } from '../daemon-health/daemon-health.schema.js'
import {
  healthStateGauge,
  supervisorExhaustionsCounter,
  supervisorRestartsCounter,
} from '../daemon-metrics/daemon-metrics.kernel.js'
import type { DaemonReporter } from '../daemon-reporter.adapter.js'
import { WorkerTypeId } from '../daemon-spec/brands.kernel.js'
import type { Intensity, IntensityConfig } from '../daemon-spec/daemon-policy.schema.js'
import type { Child, LockConfig, Supervisor, Worker } from '../daemon-spec/daemon-spec.schema.js'
import { type IntensityTracker, make as makeIntensity, neverExceeds } from '../intensity/intensity.kernel.js'
import { isModeNone } from '../leader-lock/leader-lock.kernel.js'
import type { LeaderLockAcquireError } from '../leader-lock/leader-lock.schema.js'
import type { BootedChild, Supervision, SupervisionContext } from '../supervision-policy/supervision.schema.js'
import { buildWorkerLoop } from './build-worker-loop.kernel.js'
import { raceForExit } from './race-for-exit.kernel.js'
import { type RestartStrategy } from './restart-decision.schema.js'
import { decideRestart } from './restart-decision.workflow.js'
import {
  ContinueSupervision,
  CooldownEpoch,
  type EpochStep,
  RestartEpoch,
  StopEpoch,
  StopSupervision,
  type SupervisionEpochResultType,
} from './supervision-epoch.schema.js'
import { withLeaderLock, WithLeaderLockExecutorDeps } from './with-leader-lock.executor.js'

export class SupervisorBodyExecutorDeps extends Context.Tag(
  '@systemfsoftware/effect-daemon-spec/internal/supervisor-body.executor/SupervisorBodyExecutorDeps',
)<
  SupervisorBodyExecutorDeps,
  {
    readonly onRestart: DaemonReporter['Type']['onRestart']
    readonly onExhausted: DaemonReporter['Type']['onExhausted']
  }
>() {}

const handleExhausted = <R>(
  ctx: SupervisionContext<R, SupervisorBodyExecutorDeps>,
  cause: Cause.Cause<never>,
): Effect.Effect<CooldownEpoch, never, SupervisorBodyExecutorDeps> =>
  Effect.gen(function*() {
    yield* Effect.zipRight(
      ctx.health.healthy.close,
      Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', ctx.name), 'latch', 'healthy'), 0),
    )
    yield* ctx.reportExhausted(cause)
    return new CooldownEpoch()
  })

const handleRestart = <R>(
  ctx: SupervisionContext<R, SupervisorBodyExecutorDeps>,
  cause: Cause.Cause<never>,
  onSignal: Effect.Effect<void, never, SupervisorBodyExecutorDeps>,
): Effect.Effect<RestartEpoch, never, SupervisorBodyExecutorDeps> =>
  Effect.gen(function*() {
    yield* ctx.reportRestart(cause)
    yield* onSignal
    return new RestartEpoch()
  })

const reopenHealthyAfterCooldown = <R>(
  ctx: SupervisionContext<R, SupervisorBodyExecutorDeps>,
): Effect.Effect<void, never, never> =>
  Effect.zipRight(
    ctx.health.healthy.open,
    Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', ctx.name), 'latch', 'healthy'), 1),
  )

const runSupervisionEpochWithBackoff = <R>(
  attempt: Effect.Effect<EpochStep, never, R>,
  ctx: SupervisionContext<R, SupervisorBodyExecutorDeps>,
): Effect.Effect<SupervisionEpochResultType, never, R> =>
  Effect.gen(function*() {
    const driver = yield* Schedule.driver(ctx.policy.backoff)
    const loop = (): Effect.Effect<SupervisionEpochResultType, never, R> =>
      Effect.gen(function*() {
        const step = yield* attempt.pipe(Effect.scoped)
        return yield* Match.value(step).pipe(
          Match.tag('StopEpoch', () => Effect.succeed(new StopSupervision())),
          Match.tag('CooldownEpoch', () =>
            Effect.gen(function*() {
              yield* Effect.sleep(ctx.policy.cooldown)
              yield* reopenHealthyAfterCooldown(ctx)
              return new ContinueSupervision()
            })),
          Match.tag('RestartEpoch', () =>
            Effect.gen(function*() {
              const stepped = yield* Effect.either(driver.next(void 0))
              if (Either.isLeft(stepped)) {
                return new StopSupervision()
              }
              return yield* loop()
            })),
          Match.exhaustive,
        )
      })
    return yield* loop()
  })

const openAllReady = <R>(ctx: SupervisionContext<R, SupervisorBodyExecutorDeps>): Effect.Effect<void, never, never> =>
  Effect.gen(function*() {
    yield* Effect.yieldNow()
    yield* Effect.forEach(ctx.booted, (b) => b.health.ready.await, { concurrency: 'unbounded' })
    yield* Effect.zipRight(
      ctx.health.ready.open,
      Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', ctx.name), 'latch', 'ready'), 1),
    )
  })

const superviseChild = <R>(
  ctx: SupervisionContext<R, SupervisorBodyExecutorDeps>,
  child: SupervisionContext<R, SupervisorBodyExecutorDeps>['booted'][number],
  idx: number,
): Supervision<R, SupervisorBodyExecutorDeps> =>
  Effect.gen(function*() {
    const childIntensityOpt = yield* Option.match(Option.fromNullable(child.childPolicy.intensity), {
      onNone: () => Effect.succeed(Option.none<IntensityTracker>()),
      onSome: (cfg: IntensityConfig) => Effect.map(makeIntensity(cfg.restarts, cfg.window), Option.some),
    })
    const loop = (): Supervision<R, SupervisorBodyExecutorDeps> =>
      Effect.gen(function*() {
        const supIntensity = yield* ctx.intensityEff
        const attempt = Effect.gen(function*() {
          yield* ctx.health.paused.await
          const fiber = yield* Effect.forkScoped(child.run)
          const exit = yield* Fiber.await(fiber)
          if (!Exit.isSuccess(exit)) {
            if (child.childPolicy.restart === 'temporary') {
              return new StopEpoch()
            }

            const childIntensityBudgetDone = yield* Option.match(childIntensityOpt, {
              onNone: () => Effect.succeed(false),
              onSome: (ci: IntensityTracker) =>
                Effect.gen(function*() {
                  yield* ci.record
                  return yield* ci.isExceeded
                }),
            })
            if (childIntensityBudgetDone) {
              return new StopEpoch()
            }
            yield* supIntensity.record
            const exceeded = yield* supIntensity.isExceeded

            const decision = decideRestart({
              strategy: 'one_for_one',
              exitSuccess: false,
              intensityExceeded: exceeded,
              failedIndex: idx,
              totalChildren: ctx.booted.length,
            })

            return yield* Either.match(decision, {
              onLeft: () => handleExhausted(ctx, exit.cause),
              onRight: (right) =>
                Match.value(right).pipe(
                  Match.tag('Continue', () => Effect.succeed(new StopEpoch())),
                  Match.tag('Restart', () => handleRestart(ctx, exit.cause, Effect.void)),
                  Match.exhaustive,
                ),
            })
          }
          return new StopEpoch()
        })

        const epochResult = yield* runSupervisionEpochWithBackoff(attempt, ctx)
        return yield* Match.value(epochResult).pipe(
          Match.tag('ContinueSupervision', () => loop()),
          Match.tag('StopSupervision', () => Effect.void),
          Match.exhaustive,
        )
      })

    return yield* loop()
  })

const runIndependent = <R>(
  ctx: SupervisionContext<R, SupervisorBodyExecutorDeps>,
): Supervision<R, SupervisorBodyExecutorDeps> =>
  Effect.gen(function*() {
    const fibers = yield* Effect.forEach(
      ctx.booted,
      (child: BootedChild<R>, childIdx: number) => Effect.forkScoped(superviseChild(ctx, child, childIdx)),
    )
    yield* Effect.yieldNow()
    yield* openAllReady(ctx)
    yield* Effect.forEach(
      fibers,
      (f: Fiber.RuntimeFiber<void, never>) => Fiber.await(f),
      { concurrency: 'unbounded' },
    )
  })

const runGroup = <R>(
  strategy: Exclude<RestartStrategy, 'one_for_one'>,
  ctx: SupervisionContext<R, SupervisorBodyExecutorDeps>,
): Supervision<R, SupervisorBodyExecutorDeps> =>
  Effect.gen(function*() {
    const loop = (): Supervision<R, SupervisorBodyExecutorDeps> =>
      Effect.gen(function*() {
        const intensity = yield* ctx.intensityEff
        const childIntensityTrackers = yield* Effect.forEach(ctx.booted, (b: BootedChild<R>) =>
          Option.match(Option.fromNullable(b.childPolicy.intensity), {
            onNone: () => Effect.succeed(Option.none<IntensityTracker>()),
            onSome: (cfg: IntensityConfig) => Effect.map(makeIntensity(cfg.restarts, cfg.window), Option.some),
          }))
        const cursor = yield* Ref.make(0)
        const attempt = Effect.gen(function*() {
          yield* ctx.health.paused.await
          const startIdx = yield* Ref.get(cursor)
          const slice = ctx.booted.slice(startIdx)

          const fibers = yield* Effect.forEach(slice, (c: BootedChild<R>) =>
            Effect.forkScoped(c.run))
          yield* Effect.yieldNow()
          yield* Effect.forkScoped(openAllReady(ctx))

          const [failedOffset, firstExit] = yield* raceForExit(fibers)
          if (!Exit.isSuccess(firstExit)) {
            const failedIdx = startIdx + failedOffset
            const failedBootedOpt = Option.fromNullable(ctx.booted[failedIdx])
            if (Option.isNone(failedBootedOpt)) {
              return new StopEpoch()
            }
            const failedBooted = failedBootedOpt.value

            if (failedBooted.childPolicy.restart === 'temporary') {
              return new StopEpoch()
            }

            const cIntForFailed = Option.flatten(Arr.get(childIntensityTrackers, failedIdx))
            const childIntensityBudgetDone = yield* Option.match(cIntForFailed, {
              onNone: () => Effect.succeed(false),
              onSome: (cInt: IntensityTracker) =>
                Effect.gen(function*() {
                  yield* cInt.record
                  return yield* cInt.isExceeded
                }),
            })
            if (childIntensityBudgetDone) {
              return new StopEpoch()
            }
            yield* intensity.record
            const exceeded = yield* intensity.isExceeded
            const decision = decideRestart({
              strategy,
              exitSuccess: false,
              intensityExceeded: exceeded,
              totalChildren: ctx.booted.length,
              failedIndex: failedIdx,
            })

            return yield* Either.match(decision, {
              onLeft: () => handleExhausted(ctx, firstExit.cause),
              onRight: (right) =>
                Match.value(right).pipe(
                  Match.tag('Continue', () => Effect.succeed(new StopEpoch())),
                  Match.tag(
                    'Restart',
                    (restartDecision: { readonly indices: readonly [number, ...number[]] }) =>
                      handleRestart(ctx, firstExit.cause, Ref.set(cursor, restartDecision.indices[0])),
                  ),
                  Match.exhaustive,
                ),
            })
          }
          return new StopEpoch()
        })

        const epochResult = yield* runSupervisionEpochWithBackoff(attempt, ctx)
        return yield* Match.value(epochResult).pipe(
          Match.tag('ContinueSupervision', () => loop()),
          Match.tag('StopSupervision', () => Effect.void),
          Match.exhaustive,
        )
      })

    return yield* loop()
  })

const superviseTree = <R>(
  strategy: RestartStrategy,
  ctx: SupervisionContext<R, SupervisorBodyExecutorDeps>,
): Supervision<R, SupervisorBodyExecutorDeps> =>
  Match.value(strategy).pipe(
    Match.when('one_for_one', () => runIndependent(ctx)),
    Match.when('one_for_all', () => runGroup('one_for_all', ctx)),
    Match.when('rest_for_one', () => runGroup('rest_for_one', ctx)),
    Match.exhaustive,
  )

const intensityTracker = (intensity: Intensity): Effect.Effect<IntensityTracker> =>
  Match.value(intensity).pipe(
    Match.tag('Unbounded', () => Effect.succeed(neverExceeds)),
    Match.tag('Bounded', ({ restarts, window }) => makeIntensity(restarts, window)),
    Match.exhaustive,
  )

const buildSupervisorBody = <E, R>(
  sup: Supervisor<E, R>,
  health: SupervisorHealth,
  booted: ReadonlyArray<BootedChild<R | SupervisorBodyExecutorDeps | Scope.Scope>>,
): Effect.Effect<void, never, R | SupervisorBodyExecutorDeps | Scope.Scope> =>
  Effect.gen(function*() {
    const policy = yield* sup.supervision
    // One tracker per supervisor: `make` builds a fresh Ref-backed tracker on every
    // evaluation, so an unmemoised Effect would hand each failure a zero-count budget
    // and exhaustion could never fire.
    const tracker = yield* intensityTracker(policy.intensity)
    const intensityEff = Effect.succeed(tracker)
    const reportRestart = (
      cause: Cause.Cause<never>,
    ): Effect.Effect<void, never, SupervisorBodyExecutorDeps> =>
      Effect.gen(function*() {
        const reporter = yield* SupervisorBodyExecutorDeps
        yield* Metric.increment(Metric.tagged(supervisorRestartsCounter, 'supervisor', sup.name))
        yield* reporter.onRestart(sup.name, cause)
        yield* Option.match(Option.fromNullable(sup.reporter.onRestart), {
          onNone: () => Effect.void,
          onSome: (fn: (cause: Cause.Cause<never>) => Effect.Effect<void, never, never>) => fn(cause),
        })
      })

    const reportExhausted = (
      cause: Cause.Cause<never>,
    ): Effect.Effect<void, never, SupervisorBodyExecutorDeps> =>
      Effect.gen(function*() {
        const reporter = yield* SupervisorBodyExecutorDeps
        yield* Metric.increment(Metric.tagged(supervisorExhaustionsCounter, 'supervisor', sup.name))
        yield* reporter.onExhausted(sup.name, cause)
        yield* Option.match(Option.fromNullable(sup.reporter.onExhausted), {
          onNone: () => Effect.void,
          onSome: (fn: (cause: Cause.Cause<never>) => Effect.Effect<void, never, never>) => fn(cause),
        })
      })

    const runStrategy = superviseTree<R | SupervisorBodyExecutorDeps | Scope.Scope>(
      sup.strategy,
      {
        name: sup.name,
        booted,
        health,
        policy,
        reportRestart,
        reportExhausted,
        intensityEff,
      } satisfies SupervisionContext<R | SupervisorBodyExecutorDeps | Scope.Scope, SupervisorBodyExecutorDeps>,
    )

    yield* Effect.andThen(health.paused.await, runStrategy)
  })

const isWorker = <E, R>(x: Child<E, R>): x is Worker<E, R> => WorkerTypeId in x

const bootChild = <E, R>(
  child: Child<E, R>,
): Effect.Effect<BootedChild<R | SupervisorBodyExecutorDeps | Scope.Scope>, never, R> =>
  Effect.gen(function*() {
    if (isWorker(child)) {
      const health = yield* allocateWorkerHealth(child.name)
      const loop = buildWorkerLoop(child, health, healthStateGauge).pipe(Effect.orDie)
      return { name: child.name, health, run: loop, childPolicy: child.child }
    }
    const bootedChildren = yield* Effect.forEach(child.children, bootChild<E, R>)
    const health = yield* allocateSupervisorHealth(
      child.name,
      bootedChildren.map((b) => b.health),
    )
    const body = buildSupervisorBody(child, health, bootedChildren).pipe(Effect.orDie)
    return { name: child.name, health, run: body, childPolicy: {} }
  })

export const supervisor = <E, R>(
  s: Supervisor<E, R, LockConfig>,
): Effect.Effect<
  SupervisorHealth,
  never,
  R | SupervisorBodyExecutorDeps | WithLeaderLockExecutorDeps | Scope.Scope
> =>
  Effect.gen(function*() {
    const booted = yield* Effect.forEach(s.children, bootChild<E, R>)
    const health = yield* allocateSupervisorHealth(
      s.name,
      booted.map((b) => b.health),
    )
    const body = buildSupervisorBody(s, health, booted).pipe(Effect.orDie)
    let locked: Effect.Effect<
      void,
      E | LeaderLockAcquireError,
      R | SupervisorBodyExecutorDeps | WithLeaderLockExecutorDeps | Scope.Scope
    >
    if (isModeNone(s.lock)) {
      locked = body
    } else if (s.lock.mode === 'required') {
      locked = withLeaderLock(body, {
        key: s.lock.key,
        mode: 'required',
        acquireRetryBackoff: s.lock.acquireRetryBackoff,
      })
    } else {
      locked = withLeaderLock(body, { key: s.lock.key, mode: 'optional' })
    }
    yield* Effect.forkScoped(locked.pipe(Effect.orDie))
    return health
  })
