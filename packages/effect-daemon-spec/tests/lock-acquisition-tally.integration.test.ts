import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { Noop } from '@systemfsoftware/effect-daemon-spec'
import { oneForOne } from '@systemfsoftware/effect-daemon-spec'
import { run } from '@systemfsoftware/effect-daemon-spec'
import { Supervision } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { Context, Deferred, Duration, Effect, Fiber, Layer, Match, Option, Ref, Schedule } from 'effect'
import { LeaderLockFake } from './__fixtures__/LeaderLockFake.js'
import { advanceUntil } from './__fixtures__/TestUtils.js'

const Feature = makeFeature({ it })

const quickCycleSchedule = Schedule.duration(Duration.millis(1)).pipe(
  Schedule.concat(Schedule.duration(Duration.millis(1))),
)

interface RefusalTallyShape {
  readonly refusals: Ref.Ref<number>
  readonly threeRefusals: Deferred.Deferred<void>
}

class RefusalTally extends Context.Service<RefusalTally, RefusalTallyShape>()(
  '@systemfsoftware/effect-daemon-spec/tests/lock-acquisition-tally.integration.test/RefusalTally',
) {}
const TallyingLeaderLock: Layer.Layer<LeaderLock, never, LeaderLock | RefusalTally> = Layer.effect(
  LeaderLock,
  Effect.gen(function*() {
    const inner = yield* LeaderLock
    const tally = yield* RefusalTally
    return LeaderLock.of({
      withLock: (key, self) =>
        Effect.tap(inner.withLock(key, self), (result) =>
          Option.isNone(result)
            ? Effect.gen(function*() {
              const seen = yield* Ref.updateAndGet(tally.refusals, (n) => n + 1)
              if (seen >= 3) {
                yield* Deferred.succeed(tally.threeRefusals, undefined)
              }
            })
            : Effect.void),
    })
  }),
)

const RefusalTallyLayer = Layer.effect(
  RefusalTally,
  Effect.gen(function*() {
    const refusals = yield* Ref.make(0)
    const threeRefusals = yield* Deferred.make<void>()
    return { refusals, threeRefusals }
  }),
)

const TallyLayers = Layer.mergeAll(
  Layer.provideMerge(TallyingLeaderLock.pipe(Layer.provide(LeaderLockFake)), RefusalTallyLayer),
  Noop,
)

Feature('Lock acquisition tally on contention')
  .withScenarioLayer(TallyLayers)
  .withLayer(Noop)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A <kind> with a finite retry schedule cycles while the lock is held, and acquires after the leader releases',
      [{ kind: 'worker' }, { kind: 'supervisor' }],
      (row) =>
        Gherkin.Do.pipe(
          Given('the shared resource is held while refusals are tallied')(
            'state',
            () =>
              Effect.gen(function*() {
                const counter = yield* Ref.make(0)
                const lock = yield* LeaderLock
                const tally = yield* RefusalTally
                const firstWork = yield* Deferred.make<void>()
                const holderAcquired = yield* Deferred.make<void>()
                const holder = yield* Effect.forkScoped(
                  lock.withLock(
                    'pipeline',
                    Effect.andThen(Deferred.succeed(holderAcquired, undefined), Effect.never),
                  ),
                  { startImmediately: true },
                )
                yield* Deferred.await(holderAcquired)
                return { counter, firstWork, holder, tally }
              }),
          ),
          When(`a ${row.kind} retries against the held resource and then runs after release`)(
            'readyOpen',
            (s) =>
              Match.value(row.kind).pipe(
                Match.when('worker', () =>
                  Effect.gen(function*() {
                    const signalledWork = Effect.andThen(
                      Ref.update(s.state.counter, (n) => n + 1),
                      Deferred.succeed(s.state.firstWork, undefined),
                    )
                    const worker = Daemon.poll({
                      name: 'tally-cycle-worker',
                      work: signalledWork,
                      interval: Duration.millis(1),
                      lock: {
                        key: 'pipeline',
                        mode: 'required',
                        acquireRetryBackoff: quickCycleSchedule,
                      },
                      tick: { tickTimeout: Duration.seconds(90) },
                    })
                    yield* run.worker(worker)
                    yield* advanceUntil(s.state.tally.threeRefusals, Duration.millis(1))
                    const countWhileHeld = yield* Ref.get(s.state.counter)
                    yield* Fiber.interrupt(s.state.holder)
                    yield* advanceUntil(s.state.firstWork, Duration.millis(1))
                    const countAfterRelease = yield* Ref.get(s.state.counter)
                    return { countWhileHeld, countAfterRelease }
                  })),
                Match.when('supervisor', () =>
                  Effect.gen(function*() {
                    const signalledWork = Effect.andThen(
                      Ref.update(s.state.counter, (n) => n + 1),
                      Deferred.succeed(s.state.firstWork, undefined),
                    )
                    const child = Daemon.poll({
                      name: 'tally-cycle-child',
                      work: signalledWork,
                      interval: Duration.millis(1),
                      tick: { tickTimeout: Duration.seconds(90) },
                      lock: { mode: 'none' },
                    })
                    const supervisor = oneForOne({
                      name: 'tally-cycle-parent',
                      children: [child],
                      lock: {
                        key: 'pipeline',
                        mode: 'required',
                        acquireRetryBackoff: quickCycleSchedule,
                      },
                      supervision: Supervision.worker(Duration.minutes(5)),
                    })
                    const supHealth = yield* run.supervisor(supervisor)
                    yield* advanceUntil(s.state.tally.threeRefusals, Duration.millis(1))
                    const countWhileHeld = yield* Ref.get(s.state.counter)
                    yield* Fiber.interrupt(s.state.holder)
                    yield* advanceUntil(s.state.firstWork, Duration.millis(1))
                    yield* supHealth.ready.await
                    const countAfterRelease = yield* Ref.get(s.state.counter)
                    return { countWhileHeld, countAfterRelease }
                  })),
                Match.exhaustive,
              ),
          ),
          Then('no work executes while the lock is held')((s) =>
            Effect.sync(() => {
              expect(s.readyOpen.countWhileHeld).toBe(0)
            })
          ),
          And('work runs after the holder releases')((s) =>
            Effect.sync(() => {
              expect(s.readyOpen.countAfterRelease).toBeGreaterThan(0)
            })
          ),
        ),
    )
  })
