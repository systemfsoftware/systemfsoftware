import { Cell } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Cause, Context, Effect, Either, Exit, Fiber, Match, Metric, Option, Ref, Schedule } from 'effect'
import { pipe, type Scope } from 'effect'
import { WorkerTypeId } from '../brands.kernel.js'
import type { SupervisorHealth } from '../daemon-health.schema.js'
import { healthStateGauge, supervisorExhaustionsCounter, supervisorRestartsCounter } from '../daemon-metrics.kernel.js'
import type { Intensity, IntensityConfig } from '../daemon-policy.schema.js'
import type { DaemonReporter } from '../daemon-reporter.adapter.js'
import type { Child, LockConfig, Supervisor, Worker } from '../daemon-spec.schema.js'
import { isModeNone } from '../leader-lock.kernel.js'
import type { LeaderLockAcquireError } from '../leader-lock.schema.js'
import type { BootedChild, Supervision, SupervisionContext } from '../supervision.schema.js'
import { allocateSupervisorHealth } from './allocate-supervisor-health.kernel.js'
import { allocateWorkerHealth } from './allocate-worker-health.kernel.js'
import { buildWorkerLoop } from './build-worker-loop.kernel.js'
import { type IntensityTracker, make as makeIntensity, neverExceeds } from './intensity.kernel.js'
import { raceForExit } from './race-for-exit.kernel.js'
import { type DecideInput, type RestartStrategy } from './restart-decision.schema.js'
import {
  decideRestart,
  type RestartDecisionContinue,
  type RestartDecisionExhausted,
  type RestartDecisionRestart,
} from './restart-decision.workflow.js'
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
  ctx: SupervisionContext<R>,
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
  ctx: SupervisionContext<R>,
  cause: Cause.Cause<never>,
  onSignal: Effect.Effect<void, never, SupervisorBodyExecutorDeps>,
): Effect.Effect<RestartEpoch, never, SupervisorBodyExecutorDeps> =>
  Effect.gen(function*() {
    yield* ctx.reportRestart(cause)
    yield* onSignal
    return new RestartEpoch()
  })

/**
 * The phases of the restart decision, in one bag so the chain's order is carried by types.
 */
interface RestartPhases extends Cell.Phases {
  readonly command: IntensityTracker
  readonly raw: boolean
  readonly decoded: DecideInput
  readonly decision: RestartDecisionContinue | RestartDecisionRestart
  readonly decisionError: RestartDecisionExhausted
  readonly output: Either.Either<
    RestartDecisionContinue | RestartDecisionRestart,
    RestartDecisionExhausted
  >
  readonly response: EpochStep
  readonly decodeError: never
  readonly readError: never
  readonly writeError: never
  readonly readContext: never
  readonly writeContext: SupervisorBodyExecutorDeps
}

/**
 * The restart decision, as a description whose phases chain by type and read in the order
 * they run.
 *
 * The read is a bump-and-report: recording a restart is how the current rate is obtained, so
 * the mutation is a product gathered across the read's interior rather than a write standing
 * before a decision. That is what keeps this one layer instead of two, and it is why
 * `intensity.record` sits where it does.
 *
 * `encode` is the identity because nothing needs shaping — the decision is already what the
 * write consumes — and the write only dispatches over the tags the decision produced.
 *
 * A description is built per failure because the write needs that failure's context, and the
 * phase signatures hand the command to the read alone. Restarts are rare, so the allocation is
 * paid only when a supervised child has actually died.
 */
const restartDescription = <R>(spec: {
  readonly strategy: RestartStrategy
  readonly failedIndex: number
  readonly totalChildren: number
  readonly ctx: SupervisionContext<R>
  readonly cause: Cause.Cause<never>
  readonly onRestart: (
    decision: RestartDecisionRestart,
  ) => Effect.Effect<void, never, SupervisorBodyExecutorDeps>
}) =>
  pipe(
    Cell.read<RestartPhases>((intensity) => Effect.zipRight(intensity.record, intensity.isExceeded)),
    Cell.decode<RestartPhases>((intensityExceeded) =>
      Either.right({
        strategy: spec.strategy,
        totalChildren: spec.totalChildren,
        failedIndex: spec.failedIndex,
        exitSuccess: false,
        intensityExceeded,
      })
    ),
    Cell.decide<RestartPhases>(decideRestart),
    Cell.encode<RestartPhases>((outcome) => outcome),
    Cell.write<RestartPhases>((outcome) =>
      Either.match(outcome, {
        onLeft: () => handleExhausted(spec.ctx, spec.cause),
        onRight: (right) =>
          Match.value(right).pipe(
            Match.tag('Continue', () => Effect.succeed<EpochStep>(new StopEpoch())),
            Match.tag(
              'Restart',
              (decision) => handleRestart(spec.ctx, spec.cause, spec.onRestart(decision)),
            ),
            Match.exhaustive,
          ),
      })
    ),
  )

const reopenHealthyAfterCooldown = <R>(ctx: SupervisionContext<R>): Effect.Effect<void, never, never> =>
  Effect.zipRight(
    ctx.health.healthy.open,
    Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', ctx.name), 'latch', 'healthy'), 1),
  )

const runSupervisionEpochWithBackoff = <R>(
  attempt: Effect.Effect<EpochStep, never, R>,
  ctx: SupervisionContext<R>,
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

const openAllReady = <R>(ctx: SupervisionContext<R>): Effect.Effect<void, never, never> =>
  Effect.gen(function*() {
    yield* Effect.yieldNow()
    yield* Effect.forEach(ctx.booted, (b) => b.health.ready.await, { concurrency: 'unbounded' })
    yield* Effect.zipRight(
      ctx.health.ready.open,
      Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', ctx.name), 'latch', 'ready'), 1),
    )
  })

const superviseChild = <R>(
  ctx: SupervisionContext<R>,
  child: SupervisionContext<R>['booted'][number],
  idx: number,
): Supervision<R> =>
  Effect.gen(function*() {
    const childIntensityOpt = yield* Option.match(Option.fromNullable(child.childPolicy.intensity), {
      onNone: () => Effect.succeed(Option.none<IntensityTracker>()),
      onSome: (cfg: IntensityConfig) => Effect.map(makeIntensity(cfg.restarts, cfg.window), Option.some),
    })
    const loop = (): Supervision<R> =>
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
            return yield* Cell.apply(
              restartDescription({
                strategy: 'one_for_one',
                failedIndex: idx,
                totalChildren: ctx.booted.length,
                ctx,
                cause: exit.cause,
                onRestart: () => Effect.void,
              }),
              supIntensity,
            )
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

const runIndependent = <R>(ctx: SupervisionContext<R>): Supervision<R> =>
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
  ctx: SupervisionContext<R>,
): Supervision<R> =>
  Effect.gen(function*() {
    const loop = (): Supervision<R> =>
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
            return yield* Cell.apply(
              restartDescription({
                strategy,
                failedIndex: failedIdx,
                totalChildren: ctx.booted.length,
                ctx,
                cause: firstExit.cause,
                onRestart: (decision) => Ref.set(cursor, decision.indices[0]),
              }),
              intensity,
            )
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
  ctx: SupervisionContext<R>,
): Supervision<R> =>
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
  booted: readonly BootedChild<R | SupervisorBodyExecutorDeps | Scope.Scope>[],
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
      } satisfies SupervisionContext<R | SupervisorBodyExecutorDeps | Scope.Scope>,
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
