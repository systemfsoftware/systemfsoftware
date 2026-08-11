import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Match, Schedule, TestClock } from 'effect'
import { expect } from 'vitest'
import { SupervisorBodyExecutorDeps } from '../src/daemon-reporter/mod.js'
import { BoundedIntensity } from '../src/daemon-spec/mod.js'
import { LeaderLock } from '../src/leader-lock/leader-lock.adapter.js'
import { WithLeaderLockExecutorLive } from '../src/leader-lock/mod.js'
import { run } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForAll } from '../src/supervision-policy/supervisor-one-for-all.combinator.js'
import { oneForOne } from '../src/supervision-policy/supervisor-one-for-one.combinator.js'
import { restForOne } from '../src/supervision-policy/supervisor-rest-for-one.combinator.js'
import { ReporterSpyContext } from './helpers/reporter-spy.js'
import { NoopLayer } from './helpers/shared-layers.js'

const Feature = makeFeature({ it, layer })

const stablePoll = (name: string) =>
  Daemon.poll({
    name,
    work: Effect.void,
    interval: Duration.seconds(10),
    tick: { tickTimeout: Duration.seconds(90) },
    lock: { mode: 'none' },
  })

Feature('Per-child restart policy')
  .withLayer(NoopLayer)
  .withScenarioLayer(NoopLayer)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A one-shot task that fails leaves the system operational',
      Gherkin.Do.pipe(
        Given('a one-shot task that always fails')(
          'worker',
          () =>
            Effect.succeed(
              Daemon.poll({
                name: 'one-shot-failer',
                work: Effect.fail('intentional failure'),
                interval: Duration.millis(1),
                tick: { tickTimeout: Duration.seconds(90) },
                child: { restart: 'temporary' },
                lock: { mode: 'none' },
              }),
            ),
        ),
        Given('supervisor runs long enough to tempt naive exhaustion')(
          'supHealth',
          (s) =>
            Effect.gen(function*() {
              const sup = oneForOne({
                name: 'parent',
                children: [s.worker],
                supervision: Supervision.custom({
                  intensity: new BoundedIntensity({ restarts: 1, window: Duration.seconds(1) }),
                  backoff: Schedule.exponential(Duration.millis(10), 1),
                  cooldown: Duration.minutes(30),
                }),
                lock: { mode: 'none' },
              })
              const supHealth = yield* run.supervisor(sup)
              yield* TestClock.adjust(Duration.seconds(2))
              return supHealth
            }),
        ),
        Then('the system is still operational')((s) => s.supHealth.healthy.await),
      ),
    )

    scenario(
      'A flaky task with a stricter restart budget than its parent is honoured',
      Gherkin.Do.pipe(
        Given('a flaky task that disallows any restart at the per-task level')(
          'worker',
          () =>
            Effect.succeed(
              Daemon.poll({
                name: 'no-restart-task',
                work: Effect.fail('intentional failure'),
                interval: Duration.millis(1),
                tick: { tickTimeout: Duration.seconds(90) },
                child: { intensity: { restarts: 0, window: Duration.seconds(60) } },
                lock: { mode: 'none' },
              }),
            ),
        ),
        Given('supervisor is permissive at the parent level')(
          'supHealth',
          (s) =>
            Effect.gen(function*() {
              const sup = oneForOne({
                name: 'permissive-parent',
                children: [s.worker],
                supervision: Supervision.custom({
                  intensity: new BoundedIntensity({ restarts: 1, window: Duration.seconds(1) }),
                  backoff: Schedule.exponential(Duration.millis(10), 1),
                  cooldown: Duration.minutes(30),
                }),
                lock: { mode: 'none' },
              })
              const supHealth = yield* run.supervisor(sup)
              yield* TestClock.adjust(Duration.seconds(2))
              return supHealth
            }),
        ),
        Then('the system is still operational because the per-task budget prevented any restart')((s) =>
          s.supHealth.healthy.await
        ),
      ),
    )

    scenarioOutline(
      '<strategy> <policy> respects per-child policy without group supervisor exhaustion',
      [
        { strategy: 'oneForAll', policy: 'temporary' },
        { strategy: 'oneForAll', policy: 'childBudget' },
        { strategy: 'restForOne', policy: 'temporary' },
        { strategy: 'restForOne', policy: 'childBudget' },
      ] as const,
      (row) => {
        const flaky = Match.value(row.policy).pipe(
          Match.when('temporary', () =>
            Daemon.poll({
              name: `flaky-${row.strategy}-temp`,
              work: Effect.fail('intentional failure'),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              child: { restart: 'temporary' },
              lock: { mode: 'none' },
            })),
          Match.when('childBudget', () =>
            Daemon.poll({
              name: `flaky-${row.strategy}-budget`,
              work: Effect.fail('intentional failure'),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              child: { intensity: { restarts: 0, window: Duration.seconds(60) } },
              lock: { mode: 'none' },
            })),
          Match.exhaustive,
        )

        const children = Match.value(row.strategy).pipe(
          Match.when('oneForAll', () => [flaky, stablePoll(`stable-${row.strategy}-${row.policy}`)]),
          Match.when('restForOne', () => [
            stablePoll(`rest-before-${row.strategy}-${row.policy}`),
            flaky,
            stablePoll(`rest-after-${row.strategy}-${row.policy}`),
          ]),
          Match.exhaustive,
        )

        const supervisorIntensity = Match.value(row.policy).pipe(
          Match.when('temporary', () => ({ restarts: 0, window: Duration.seconds(1) })),
          Match.when('childBudget', () => ({ restarts: 10, window: Duration.seconds(1) })),
          Match.exhaustive,
        )

        return Gherkin.Do.pipe(
          Given('group supervisor under test with reporter spy')(
            'out',
            () =>
              Effect.gen(function*() {
                const spy = yield* ReporterSpyContext
                const reporterLayer = Layer.mergeAll(
                  LeaderLock.Noop,
                  WithLeaderLockExecutorLive.pipe(Layer.provide(LeaderLock.Noop)),
                  Layer.succeed(SupervisorBodyExecutorDeps, {
                    onRestart: spy.reporter.onRestart,
                    onExhausted: spy.reporter.onExhausted,
                  }),
                )
                const supervisorOpts = {
                  name: `group-parent-${row.strategy}-${row.policy}`,
                  children,
                  lock: { mode: 'none' as const },
                  supervision: Supervision.custom({
                    intensity: new BoundedIntensity(supervisorIntensity),
                    backoff: Schedule.exponential(Duration.millis(10), 1),
                    cooldown: Duration.minutes(30),
                  }),
                }

                const sup = Match.value(row.strategy).pipe(
                  Match.when('oneForAll', () => oneForAll(supervisorOpts)),
                  Match.when('restForOne', () => restForOne(supervisorOpts)),
                  Match.exhaustive,
                )
                const supHealth = yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
                yield* TestClock.adjust(Duration.seconds(2))
                const exhaustions = yield* spy.getExhaustions()
                const restarts = yield* spy.getRestarts()
                return { supHealth, exhaustions, restarts }
              }),
          ),
          Then('supervisor healthy latch stays open')((s) => s.out.supHealth.healthy.await),
          And('reporter records no supervisor exhaustion events')((s) =>
            Effect.sync(() => {
              expect(s.out.exhaustions).toHaveLength(0)
            })
          ),
          And('reporter records no supervisor restart events')((s) =>
            Effect.sync(() => {
              expect(s.out.restarts).toHaveLength(0)
            })
          ),
        )
      },
    )

    scenario(
      'oneForAll treats omitted child restart policy as permanent and exhausts supervisor',
      Gherkin.Do.pipe(
        When('a group supervisor with default permanent policy and zero restarts budget')(
          'out',
          () =>
            Effect.gen(function*() {
              const spy = yield* ReporterSpyContext
              const reporterLayer = Layer.mergeAll(
                LeaderLock.Noop,
                WithLeaderLockExecutorLive.pipe(Layer.provide(LeaderLock.Noop)),
                Layer.succeed(SupervisorBodyExecutorDeps, {
                  onRestart: spy.reporter.onRestart,
                  onExhausted: spy.reporter.onExhausted,
                }),
              )
              const worker = Daemon.poll({
                name: 'default-permanent-fail',
                work: Effect.fail('intentional failure'),
                interval: Duration.millis(1),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const sup = oneForAll({
                name: 'default-policy-parent',
                children: [worker],
                supervision: Supervision.custom({
                  intensity: new BoundedIntensity({ restarts: 0, window: Duration.seconds(1) }),
                  backoff: Schedule.exponential(Duration.millis(10), 1),
                  cooldown: Duration.minutes(30),
                }),
                lock: { mode: 'none' },
              })
              const supHealth = yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
              yield* TestClock.adjust(Duration.seconds(2))
              const exhaustions = yield* spy.getExhaustions()
              const healthyOpen = yield* supHealth.healthy.await.pipe(
                Effect.timeout('0 millis'),
                Effect.matchEffect({
                  onFailure: () => Effect.succeed(false),
                  onSuccess: () => Effect.succeed(true),
                }),
              )
              return { exhaustions, healthyOpen }
            }),
        ),
        Then('healthy latch closes and supervisor exhaustion is reported')((s) =>
          Effect.sync(() => {
            expect(s.out.healthyOpen).toBe(false)
            expect(s.out.exhaustions.length).toBeGreaterThanOrEqual(1)
          })
        ),
      ),
    )
  })
