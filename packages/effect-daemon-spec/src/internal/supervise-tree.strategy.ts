import {
  Array as Arr,
  Cause,
  Duration,
  Effect,
  Either,
  Exit,
  Fiber,
  Match,
  Metric,
  Option,
  Ref,
  Schedule,
  Schema as S,
} from 'effect'
import * as Sch from 'effect/Schema'
import { healthStateGauge } from '../daemon-metrics.js'
import { BoundedIntensity } from '../daemon-policy.schema.js'
import type { BootedChild } from './boot.js'
import type { IntensityTracker } from './intensity.js'
import { make as makeIntensity } from './intensity.js'
import { Restart } from './restart-decision.schema.js'
import { decideRestart, type RestartStrategy } from './restart-decision.strategy.js'
import { failedIndexOf } from './supervise-index.js'
import { openAllReady, raceForExit, type Supervision, type SupervisionContext } from './supervision-context.strategy.js'

const EpochStepTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon/EpochStep')
type EpochStepTypeId = typeof EpochStepTypeId

class StopEpoch extends S.TaggedClass<StopEpoch>()('StopEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}

class RestartEpoch extends S.TaggedClass<RestartEpoch>()('RestartEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}

class CooldownEpoch extends S.TaggedClass<CooldownEpoch>()('CooldownEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}

const EpochStep = S.Union(StopEpoch, RestartEpoch, CooldownEpoch)
type EpochStep = typeof EpochStep.Type

const SupervisionEpochResultTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/SupervisionEpochResult',
)
type SupervisionEpochResultTypeId = typeof SupervisionEpochResultTypeId

class StopSupervision extends S.TaggedClass<StopSupervision>()('StopSupervision', {}) {
  readonly [SupervisionEpochResultTypeId] = SupervisionEpochResultTypeId
}

class ContinueSupervision extends S.TaggedClass<ContinueSupervision>()('ContinueSupervision', {}) {
  readonly [SupervisionEpochResultTypeId] = SupervisionEpochResultTypeId
}

const SupervisionEpochResult = S.Union(StopSupervision, ContinueSupervision)
type SupervisionEpochResultType = typeof SupervisionEpochResult.Type

type RestartOnly = Sch.Schema.Type<typeof Restart>

const handleExhausted = <R>(ctx: SupervisionContext<R>, cause: Cause.Cause<never>) =>
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
  onSignal: Effect.Effect<void>,
) =>
  Effect.gen(function*() {
    yield* ctx.reportRestart(cause)
    yield* onSignal
    return new RestartEpoch()
  })

const reopenHealthyAfterCooldown = <R>(ctx: SupervisionContext<R>) =>
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
              yield* Effect.sleep(Duration.decode(ctx.policy.cooldown))
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

const superviseChild = <R>(
  ctx: SupervisionContext<R>,
  child: SupervisionContext<R>['booted'][number],
  idx: number,
): Supervision<R> =>
  Effect.gen(function*() {
    const childIntensityOpt = yield* Option.match(Option.fromNullable(child.childPolicy.intensity), {
      onNone: () => Effect.succeed(Option.none<IntensityTracker>()),
      onSome: (cfg) => Effect.map(makeIntensity(new BoundedIntensity(cfg)), Option.some),
    })

    const loop = (): Supervision<R> =>
      Effect.gen(function*() {
        const supIntensity = yield* makeIntensity(ctx.policy.intensity)

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

            return yield* Match.value(decision).pipe(
              Match.tag('Continue', () => Effect.succeed(new StopEpoch())),
              Match.tag('Exhausted', () => handleExhausted(ctx, exit.cause)),
              Match.tag('Restart', () => handleRestart(ctx, exit.cause, Effect.void)),
              Match.exhaustive,
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
        const intensity = yield* makeIntensity(ctx.policy.intensity)
        const childIntensityTrackers = yield* Effect.forEach(ctx.booted, (b: BootedChild<R>) =>
          Option.match(Option.fromNullable(b.childPolicy.intensity), {
            onNone: () => Effect.succeed(Option.none<IntensityTracker>()),
            onSome: (cfg) => Effect.map(makeIntensity(new BoundedIntensity(cfg)), Option.some),
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
            const failedIdx = failedIndexOf(startIdx, failedOffset)
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
              failedIndex: failedIdx,
              totalChildren: ctx.booted.length,
            })

            return yield* Match.value(decision).pipe(
              Match.tag('Continue', () => Effect.succeed(new StopEpoch())),
              Match.tag('Exhausted', () => handleExhausted(ctx, firstExit.cause)),
              Match.tag('Restart', (restartDecision: RestartOnly) =>
                handleRestart(ctx, firstExit.cause, Ref.set(cursor, restartDecision.indices[0]))),
              Match.exhaustive,
            )
          }
          return new StopEpoch()
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

export const superviseTree = <R>(
  strategy: RestartStrategy,
  ctx: SupervisionContext<R>,
): Supervision<R> =>
  Match.value(strategy).pipe(
    Match.when('one_for_one', () => runIndependent(ctx)),
    Match.when('one_for_all', () => runGroup('one_for_all', ctx)),
    Match.when('rest_for_one', () => runGroup('rest_for_one', ctx)),
    Match.exhaustive,
  )
