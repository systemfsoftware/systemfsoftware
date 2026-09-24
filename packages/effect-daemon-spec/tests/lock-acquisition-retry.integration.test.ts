import { expect } from '@effect/vitest'
import { Noop } from '@systemfsoftware/effect-daemon-spec'
import { run } from '@systemfsoftware/effect-daemon-spec'
import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { Supervision } from '@systemfsoftware/effect-daemon-spec'
import { oneForOne } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Deferred, Duration, Effect, Fiber, Layer, Match, Ref, Schedule } from 'effect'
import { TestClock } from 'effect/testing'
import { LeaderLockFake } from './__fixtures__/LeaderLockFake.js'
import { advanceUntil } from './__fixtures__/TestUtils.js'

const Feature = makeFeature({ it })

const finiteSchedule = Schedule.duration(Duration.millis(1)).pipe(
  Schedule.concat(Schedule.duration(Duration.millis(1))),
  Schedule.concat(Schedule.duration(Duration.millis(1))),
)

Feature('Lock acquisition retry on contention')
  .withLayer(Noop)
  .withScenarioLayer(
    Layer.mergeAll(
      LeaderLockFake,
      Noop,
    ),
  )
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A <kind> waiting for a busy resource resumes once the resource frees up',
      [{ kind: 'worker' }, { kind: 'supervisor' }],
      (row) =>
        Gherkin.Do.pipe(
          Given('a fiber holding the shared resource for fifty virtual milliseconds')(
            'state',
            () =>
              Effect.gen(function*() {
                const counter = yield* Ref.make(0)
                const lock = yield* LeaderLock
                const holderAcquired = yield* Deferred.make<void>()
                const holder = yield* Effect.forkChild(
                  lock.withLock(
                    'pipeline',
                    Effect.andThen(Deferred.succeed(holderAcquired, undefined), Effect.sleep(Duration.millis(50))),
                  ),
                )
                yield* Deferred.await(holderAcquired)
                return { counter, holder }
              }),
          ),
          When(
            `a ${row.kind} that retries lock acquisition runs against the contended resource for two hundred virtual milliseconds`,
          )(
            'readyOpen',
            row.kind === 'worker'
              ? (s) =>
                Effect.gen(function*() {
                  const firstWork = yield* Deferred.make<void>()
                  const signalledWork = Effect.andThen(
                    Ref.update(s.state.counter, (n) => n + 1),
                    Deferred.succeed(firstWork, undefined),
                  )
                  const worker = Daemon.poll({
                    name: 'patient-worker',
                    work: signalledWork,
                    interval: Duration.millis(1),
                    lock: {
                      key: 'pipeline',
                      mode: 'required',
                      acquireRetryBackoff: Schedule.exponential(Duration.millis(10), 1),
                    },
                    tick: { tickTimeout: Duration.seconds(90) },
                  })
                  yield* run.worker(worker)
                  yield* Effect.forkChild(TestClock.adjust(Duration.millis(200)))
                  yield* Deferred.await(firstWork)
                  return true
                })
              : (s) =>
                Effect.gen(function*() {
                  const firstWork = yield* Deferred.make<void>()
                  const signalledWork = Effect.andThen(
                    Ref.update(s.state.counter, (n) => n + 1),
                    Deferred.succeed(firstWork, undefined),
                  )
                  const child = Daemon.poll({
                    name: 'patient-child',
                    work: signalledWork,
                    interval: Duration.millis(1),
                    tick: { tickTimeout: Duration.seconds(90) },
                    lock: { mode: 'none' },
                  })
                  const supervisor = oneForOne({
                    name: 'patient-parent',
                    children: [child],
                    lock: {
                      key: 'pipeline',
                      mode: 'required',
                      acquireRetryBackoff: Schedule.exponential(Duration.millis(10), 1),
                    },
                    supervision: Supervision.worker(Duration.minutes(5)),
                  })
                  const supHealth = yield* run.supervisor(supervisor)
                  yield* Effect.forkChild(TestClock.adjust(Duration.millis(200)))
                  yield* Deferred.await(firstWork)
                  yield* supHealth.ready.await
                  return true
                }),
          ),
          Then('the daemon performs work after the resource frees')((s) =>
            Effect.sync(() => {
              expect(s.readyOpen).toEqual(true)
            })
          ),
          And('work eventually runs')((s) =>
            Effect.gen(function*() {
              const count = yield* Ref.get(s.state.counter)
              expect(count).toBeGreaterThan(0)
            })
          ),
          And('the holder fiber has completed')((s) => Fiber.await(s.state.holder).pipe(Effect.asVoid)),
        ),
    )

    scenarioOutline(
      'A <kind> with a finite retry schedule exhausts retries while leader holds lock, then restarts and acquires after leader releases',
      [{ kind: 'worker' }, { kind: 'supervisor' }],
      (row) =>
        Gherkin.Do.pipe(
          Given('a fiber holding the shared resource for fifty virtual milliseconds')(
            'state',
            () =>
              Effect.gen(function*() {
                const counter = yield* Ref.make(0)
                const lock = yield* LeaderLock
                const holderAcquired = yield* Deferred.make<void>()
                const holder = yield* Effect.forkChild(
                  lock.withLock(
                    'pipeline',
                    Effect.andThen(Deferred.succeed(holderAcquired, undefined), Effect.sleep(Duration.millis(50))),
                  ),
                )
                yield* Deferred.await(holderAcquired)
                return { counter, holder }
              }),
          ),
          When(
            `a ${row.kind} with a finite retry schedule runs against the contended resource for two hundred virtual milliseconds`,
          )(
            'readyOpen',
            (s) =>
              Match.value(row.kind).pipe(
                Match.when('worker', () =>
                  Effect.gen(function*() {
                    const firstWork = yield* Deferred.make<void>()
                    const signalledWork = Effect.andThen(
                      Ref.update(s.state.counter, (n) => n + 1),
                      Deferred.succeed(firstWork, undefined),
                    )
                    const worker = Daemon.poll({
                      name: 'finite-retry-worker',
                      work: signalledWork,
                      interval: Duration.millis(1),
                      lock: {
                        key: 'pipeline',
                        mode: 'required',
                        acquireRetryBackoff: finiteSchedule,
                      },
                      tick: { tickTimeout: Duration.seconds(90) },
                    })
                    yield* run.worker(worker)
                    yield* advanceUntil(firstWork, Duration.millis(1))
                    return true
                  })),
                Match.when('supervisor', () =>
                  Effect.gen(function*() {
                    const firstWork = yield* Deferred.make<void>()
                    const signalledWork = Effect.andThen(
                      Ref.update(s.state.counter, (n) => n + 1),
                      Deferred.succeed(firstWork, undefined),
                    )
                    const child = Daemon.poll({
                      name: 'finite-retry-child',
                      work: signalledWork,
                      interval: Duration.millis(1),
                      tick: { tickTimeout: Duration.seconds(90) },
                      lock: { mode: 'none' },
                    })
                    const supervisor = oneForOne({
                      name: 'finite-retry-parent',
                      children: [child],
                      lock: {
                        key: 'pipeline',
                        mode: 'required',
                        acquireRetryBackoff: finiteSchedule,
                      },
                      supervision: Supervision.worker(Duration.minutes(5)),
                    })
                    const supHealth = yield* run.supervisor(supervisor)
                    yield* advanceUntil(firstWork, Duration.millis(1))
                    yield* supHealth.ready.await
                    return true
                  })),
                Match.exhaustive,
              ),
          ),
          Then('the daemon performs work after the resource frees')((s) =>
            Effect.sync(() => {
              expect(s.readyOpen).toEqual(true)
            })
          ),
          And('work eventually runs')((s) =>
            Effect.gen(function*() {
              const count = yield* Ref.get(s.state.counter)
              expect(count).toBeGreaterThan(0)
            })
          ),
          And('the holder fiber has completed')((s) => Fiber.await(s.state.holder).pipe(Effect.asVoid)),
        ),
    )
  })
