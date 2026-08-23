import { Cell } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Cause, Clock, Effect, Exit, Fiber, Match, Metric, Option, Ref, Result, Schedule } from 'effect'
import { pipe, type Scope } from 'effect'
import { WorkerTypeId } from '../Brands.js'
import type { SupervisorHealth } from '../DaemonHealth.schema.js'
import { healthStateGauge, supervisorExhaustionsCounter, supervisorRestartsCounter } from '../DaemonMetrics.js'
import type { Intensity, IntensityConfig } from '../DaemonPolicy.schema.js'
import type { DaemonReporter } from '../DaemonReporterAdapter.js'
import type { Child, LockConfig, Supervisor, Worker } from '../DaemonSpec.schema.js'
import type { BootedChild, Supervision, SupervisionContext } from '../Supervision.schema.js'
import { allocateSupervisorHealth } from './AllocateSupervisorHealth.js'
import { allocateWorkerHealth } from './AllocateWorkerHealth.js'
import { buildWorkerLoop } from './BuildWorkerLoop.js'
import { type IntensityTracker, make as makeIntensity, neverExceeds } from './Intensity.js'
import { raceForExit } from './RaceForExit.js'
import { type DecideInput, type RestartStrategy } from './RestartDecision.schema.js'
import {
  decideRestart,
  type RestartDecisionContinue,
  type RestartDecisionExhausted,
  type RestartDecisionRestart,
} from './RestartDecision.workflow.js'
import {
  ContinueSupervision,
  CooldownEpoch,
  type EpochStep,
  RestartEpoch,
  StopEpoch,
  StopSupervision,
  type SupervisionEpochResultType,
} from './SupervisionEpoch.schema.js'
import { type LockBinding, withLockByMode } from './WithLockByModeExecutor.js'

const handleExhausted = <R>(
  ctx: SupervisionContext<R>,
  cause: Cause.Cause<never>,
): Effect.Effect<CooldownEpoch, never, never> =>
  Effect.gen(function*() {
    yield* Effect.andThen(
      ctx.health.healthy.close,
      Metric.update(Metric.withAttributes(healthStateGauge, { daemon: ctx.name, latch: 'healthy' }), 0),
    )
    yield* ctx.reportExhausted(cause)
    return CooldownEpoch.make()
  })

const handleRestart = <R>(
  ctx: SupervisionContext<R>,
  cause: Cause.Cause<never>,
  onSignal: Effect.Effect<void, never, never>,
): Effect.Effect<RestartEpoch, never, never> =>
  Effect.gen(function*() {
    yield* ctx.reportRestart(cause)
    yield* onSignal
    return RestartEpoch.make()
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
  readonly output: Result.Result<
    RestartDecisionContinue | RestartDecisionRestart,
    RestartDecisionExhausted
  >
  readonly response: EpochStep
  readonly decodeError: never
  readonly readError: never
  readonly writeError: never
  readonly readContext: never
  readonly writeContext: never
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
  ) => Effect.Effect<void, never, never>
}) =>
  pipe(
    Cell.read<RestartPhases>((intensity) => Effect.andThen(intensity.record, intensity.isExceeded)),
    Cell.decode<RestartPhases>((intensityExceeded) =>
      Result.succeed({
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
      Result.match(outcome, {
        onFailure: () => handleExhausted(spec.ctx, spec.cause),
        onSuccess: (right) =>
          Match.value(right).pipe(
            Match.tag('Continue', () => Effect.succeed<EpochStep>(StopEpoch.make())),
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
  Effect.andThen(
    ctx.health.healthy.open,
    Metric.update(Metric.withAttributes(healthStateGauge, { daemon: ctx.name, latch: 'healthy' }), 1),
  )

const runSupervisionEpochWithBackoff = <R>(
  attempt: Effect.Effect<EpochStep, never, R>,
  ctx: SupervisionContext<R>,
): Effect.Effect<SupervisionEpochResultType, never, R> =>
  Effect.gen(function*() {
    const advance = yield* Schedule.toStep(ctx.policy.backoff)
    // v3-faithful epoch timing: v3's `ScheduleDriver.next` slept
    // `Intervals.start(decision.intervals) - now` on every step
    // (repos/effect/packages/effect/src/internal/schedule.ts:165-201), and
    // `addDelay`/`modifyDelay` raised the next interval's start to
    // `now + out` on every step (same file, 1116-1137), so the very first step
    // already slept the base delay. v4 `Schedule.exponential` yields the same
    // non-zero first step — `base * factor^(attempt - 1)` with attempt starting
    // at 1 (repos/effect-v4/packages/effect/src/Schedule.ts:850-859) — and the
    // pure-core property test (backoff.kernel.property.test.ts) treats the
    // first delay as a real delay. `Schedule.toStep` returns the delay for the
    // caller to sleep, so we sleep it on every step; a done pull (Result
    // failure) short-circuits before any sleep, exactly like v3's driver.
    const loop = (): Effect.Effect<SupervisionEpochResultType, never, R> =>
      Effect.gen(function*() {
        const epochStep = yield* attempt.pipe(Effect.scoped)
        return yield* Match.value(epochStep).pipe(
          Match.tag('StopEpoch', () => Effect.succeed(StopSupervision.make())),
          Match.tag('CooldownEpoch', () =>
            Effect.gen(function*() {
              yield* Effect.sleep(ctx.policy.cooldown)
              yield* reopenHealthyAfterCooldown(ctx)
              return ContinueSupervision.make()
            })),
          Match.tag('RestartEpoch', () =>
            Effect.gen(function*() {
              const now = yield* Clock.currentTimeMillis
              const pulled = yield* Effect.result(advance(now, void 0))
              if (Result.isFailure(pulled)) {
                return StopSupervision.make()
              }
              const [, delay] = pulled.success
              yield* Effect.sleep(delay)
              return yield* loop()
            })),
          Match.exhaustive,
        )
      })
    return yield* loop()
  })

const openAllReady = <R>(ctx: SupervisionContext<R>): Effect.Effect<void, never, never> =>
  Effect.gen(function*() {
    yield* Effect.yieldNow
    yield* Effect.forEach(ctx.booted, (b) => b.health.ready.await, { concurrency: 'unbounded' })
    yield* Effect.andThen(
      ctx.health.ready.open,
      Metric.update(Metric.withAttributes(healthStateGauge, { daemon: ctx.name, latch: 'ready' }), 1),
    )
  })

/**
 * Records one restart against the child's intensity tracker and reports whether the
 * child's restart budget is now exceeded. A child without a bounded intensity policy
 * never hits the budget.
 */
const isChildIntensityBudgetDone = (
  tracker: Option.Option<IntensityTracker>,
): Effect.Effect<boolean, never, never> =>
  Option.match(tracker, {
    onNone: () => Effect.succeed(false),
    onSome: (ci: IntensityTracker) =>
      Effect.gen(function*() {
        yield* ci.record
        return yield* ci.isExceeded
      }),
  })

const superviseChild = <R>(
  ctx: SupervisionContext<R>,
  child: SupervisionContext<R>['booted'][number],
  idx: number,
): Supervision<R> =>
  Effect.gen(function*() {
    const childIntensityOpt = yield* Option.match(Option.fromNullishOr(child.childPolicy.intensity), {
      onNone: () => Effect.succeed(Option.none<IntensityTracker>()),
      onSome: (cfg: IntensityConfig) => Effect.map(makeIntensity(cfg.restarts, cfg.window), Option.some),
    })
    const loop = (): Supervision<R> =>
      Effect.gen(function*() {
        const supIntensity = yield* ctx.intensityEff
        const attempt = Effect.gen(function*() {
          yield* ctx.health.paused.await
          const fiber = yield* Effect.forkScoped(child.run, { startImmediately: true })
          const exit = yield* Fiber.await(fiber)
          if (!Exit.isSuccess(exit)) {
            if (child.childPolicy.restart === 'temporary') {
              return StopEpoch.make()
            }

            const childIntensityBudgetDone = yield* isChildIntensityBudgetDone(childIntensityOpt)
            if (childIntensityBudgetDone) {
              return StopEpoch.make()
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
          return StopEpoch.make()
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
      (child: BootedChild<R>, childIdx: number) =>
        Effect.forkScoped(superviseChild(ctx, child, childIdx), { startImmediately: true }),
    )
    yield* Effect.yieldNow
    yield* openAllReady(ctx)
    yield* Effect.forEach(
      fibers,
      (f: Fiber.Fiber<void, never>) => Fiber.await(f),
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
          Option.match(Option.fromNullishOr(b.childPolicy.intensity), {
            onNone: () => Effect.succeed(Option.none<IntensityTracker>()),
            onSome: (cfg: IntensityConfig) => Effect.map(makeIntensity(cfg.restarts, cfg.window), Option.some),
          }))
        const cursor = yield* Ref.make(0)
        const attempt = Effect.gen(function*() {
          yield* ctx.health.paused.await
          const startIdx = yield* Ref.get(cursor)
          const slice = ctx.booted.slice(startIdx)

          const fibers = yield* Effect.forEach(slice, (c: BootedChild<R>) =>
            Effect.forkScoped(c.run, { startImmediately: true }))
          yield* Effect.yieldNow
          yield* Effect.forkScoped(openAllReady(ctx), { startImmediately: true })

          const [failedOffset, firstExit] = yield* raceForExit(fibers)
          if (!Exit.isSuccess(firstExit)) {
            const failedIdx = startIdx + failedOffset
            const failedBootedOpt = Option.fromNullishOr(ctx.booted[failedIdx])
            if (Option.isNone(failedBootedOpt)) {
              return StopEpoch.make()
            }
            const failedBooted = failedBootedOpt.value

            if (failedBooted.childPolicy.restart === 'temporary') {
              return StopEpoch.make()
            }

            const cIntForFailed = Option.flatten(Arr.get(childIntensityTrackers, failedIdx))
            const childIntensityBudgetDone = yield* isChildIntensityBudgetDone(cIntForFailed)
            if (childIntensityBudgetDone) {
              return StopEpoch.make()
            }
            return yield* Cell.apply(
              restartDescription({
                strategy,
                failedIndex: failedIdx,
                totalChildren: ctx.booted.length,
                ctx,
                cause: firstExit.cause,
                onRestart: (decision) =>
                  Ref.set(cursor, decision.indices[0]),
              }),
              intensity,
            )
          }
          return StopEpoch.make()
        })

        const epochResult = yield* runSupervisionEpochWithBackoff(attempt, ctx)
        return yield* Match.value(epochResult).pipe(
          Match.tag('ContinueSupervision', () =>
            loop()),
          Match.tag('StopSupervision', () =>
            Effect.void),
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
  booted: readonly BootedChild<R | Scope.Scope>[],
  reporter: DaemonReporter['Service'],
): Effect.Effect<void, never, R | Scope.Scope> =>
  Effect.gen(function*() {
    const policy = yield* sup.supervision
    // One tracker per supervisor: `make` builds a fresh Ref-backed tracker on every
    // evaluation, so an unmemoised Effect would hand each failure a zero-count budget
    // and exhaustion could never fire.
    const tracker = yield* intensityTracker(policy.intensity)
    const intensityEff = Effect.succeed(tracker)
    const reportRestart = (
      cause: Cause.Cause<never>,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function*() {
        yield* Metric.update(Metric.withAttributes(supervisorRestartsCounter, { supervisor: sup.name }), 1)
        yield* reporter.onRestart(sup.name, cause)
        yield* Option.match(Option.fromNullishOr(sup.reporter.onRestart), {
          onNone: () => Effect.void,
          onSome: (fn: (cause: Cause.Cause<never>) => Effect.Effect<void, never, never>) => fn(cause),
        })
      })

    const reportExhausted = (
      cause: Cause.Cause<never>,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function*() {
        yield* Metric.update(Metric.withAttributes(supervisorExhaustionsCounter, { supervisor: sup.name }), 1)
        yield* reporter.onExhausted(sup.name, cause)
        yield* Option.match(Option.fromNullishOr(sup.reporter.onExhausted), {
          onNone: () => Effect.void,
          onSome: (fn: (cause: Cause.Cause<never>) => Effect.Effect<void, never, never>) => fn(cause),
        })
      })

    const runStrategy = superviseTree<R | Scope.Scope>(
      sup.strategy,
      {
        name: sup.name,
        booted,
        health,
        policy,
        reportRestart,
        reportExhausted,
        intensityEff,
      } satisfies SupervisionContext<R | Scope.Scope>,
    )

    yield* Effect.andThen(health.paused.await, runStrategy)
  })

const isWorker = <E, R>(x: Child<E, R>): x is Worker<E, R> => WorkerTypeId in x

const bootChild = <E, R>(
  child: Child<E, R>,
  reporter: DaemonReporter['Service'],
): Effect.Effect<BootedChild<R | Scope.Scope>, never, R> =>
  Effect.gen(function*() {
    if (isWorker(child)) {
      const health = yield* allocateWorkerHealth(child.name)
      const loop = buildWorkerLoop(child, health, healthStateGauge).pipe(Effect.orDie)
      return { name: child.name, health, run: loop, childPolicy: child.child }
    }
    const bootedChildren = yield* Effect.forEach(child.children, (c) => bootChild<E, R>(c, reporter))
    const health = yield* allocateSupervisorHealth(
      child.name,
      bootedChildren.map((b) => b.health),
    )
    const body = buildSupervisorBody(child, health, bootedChildren, reporter).pipe(Effect.orDie)
    return { name: child.name, health, run: body, childPolicy: {} }
  })

/** @internal */
export const supervisor = <E, R>(
  s: Supervisor<E, R, LockConfig>,
  reporter: DaemonReporter['Service'],
  binding: LockBinding,
): Effect.Effect<SupervisorHealth, never, R | Scope.Scope> =>
  Effect.gen(function*() {
    const booted = yield* Effect.forEach(s.children, (child) => bootChild<E, R>(child, reporter))
    const health = yield* allocateSupervisorHealth(
      s.name,
      booted.map((b) => b.health),
    )
    const body = buildSupervisorBody(s, health, booted, reporter).pipe(Effect.orDie)
    const locked = withLockByMode(body, binding)
    yield* Effect.forkScoped(locked.pipe(Effect.orDie), { startImmediately: true })
    return health
  })
