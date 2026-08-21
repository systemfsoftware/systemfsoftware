import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Fiber, Latch, Layer, Match, Ref, Schedule } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { Noop } from '../src/DaemonReporterAdapter.js'
import { run } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { LeaderLock } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForOne } from '../src/mod.js'
import { LeaderLockFake } from './__fixtures__/LeaderLockFake.js'

const Feature = makeFeature({ it, layer })

const finiteSchedule = Schedule.duration(Duration.millis(1)).pipe(
  Schedule.concat(Schedule.duration(Duration.millis(1))),
  Schedule.concat(Schedule.duration(Duration.millis(1))),
)

const quickCycleSchedule = Schedule.duration(Duration.millis(1)).pipe(
  Schedule.concat(Schedule.duration(Duration.millis(1))),
)

Feature('Lock acquisition retry on contention')
  .withLayer(Noop)
  .withScenarioLayer(
    Layer.mergeAll(
      LeaderLockFake,
      TestClock.layer(),
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
                const holder = yield* Effect.forkChild(
                  lock.withLock('pipeline', Effect.sleep(Duration.millis(50))),
                )
                yield* Effect.yieldNow
                return { counter, holder }
              }),
          ),
          When(
            `a ${row.kind} that retries lock acquisition runs against the contended resource for two hundred virtual milliseconds`,
          )(
            'readyOpen',
            (s) =>
              Match.value(row.kind).pipe(
                Match.when('worker', () =>
                  Effect.gen(function*() {
                    const worker = Daemon.poll({
                      name: 'patient-worker',
                      work: Ref.update(s.state.counter, (n) => n + 1),
                      interval: Duration.millis(1),
                      lock: {
                        key: 'pipeline',
                        mode: 'required',
                        acquireRetryBackoff: Schedule.exponential(Duration.millis(10), 1),
                      },
                      tick: { tickTimeout: Duration.seconds(90) },
                    })
                    yield* run.worker(worker)
                    yield* TestClock.adjust(Duration.millis(200))
                    return true
                  })),
                Match.when('supervisor', () =>
                  Effect.gen(function*() {
                    const child = Daemon.poll({
                      name: 'patient-child',
                      work: Ref.update(s.state.counter, (n) => n + 1),
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
                    yield* TestClock.adjust(Duration.millis(200))
                    return yield* supHealth.ready.await.pipe(
                      Effect.timeout('0 millis'),
                      Effect.matchEffect({
                        onFailure: () => Effect.succeed(false),
                        onSuccess: () => Effect.succeed(true),
                      }),
                    )
                  })),
                Match.exhaustive,
              ),
          ),
          Then('the daemon performs work after the resource frees')((s) =>
            Effect.sync(() => {
              expect(s.readyOpen).toBe(true)
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
                const holder = yield* Effect.forkChild(
                  lock.withLock('pipeline', Effect.sleep(Duration.millis(50))),
                )
                yield* Effect.yieldNow
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
                    const worker = Daemon.poll({
                      name: 'finite-retry-worker',
                      work: Ref.update(s.state.counter, (n) => n + 1),
                      interval: Duration.millis(1),
                      lock: {
                        key: 'pipeline',
                        mode: 'required',
                        acquireRetryBackoff: finiteSchedule,
                      },
                      tick: { tickTimeout: Duration.seconds(90) },
                    })
                    yield* run.worker(worker)
                    yield* TestClock.adjust(Duration.millis(200))
                    return true
                  })),
                Match.when('supervisor', () =>
                  Effect.gen(function*() {
                    const child = Daemon.poll({
                      name: 'finite-retry-child',
                      work: Ref.update(s.state.counter, (n) => n + 1),
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
                    yield* TestClock.adjust(Duration.millis(200))
                    return yield* supHealth.ready.await.pipe(
                      Effect.timeout('0 millis'),
                      Effect.matchEffect({
                        onFailure: () => Effect.succeed(false),
                        onSuccess: () => Effect.succeed(true),
                      }),
                    )
                  })),
                Match.exhaustive,
              ),
          ),
          Then('the daemon performs work after the resource frees')((s) =>
            Effect.sync(() => {
              expect(s.readyOpen).toBe(true)
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
      'A <kind> with a finite retry schedule cycles indefinitely while lock is held forever, and acquires after leader releases',
      [{ kind: 'worker' }, { kind: 'supervisor' }],
      (row) =>
        Gherkin.Do.pipe(
          Given('a fiber holding the shared resource indefinitely')(
            'state',
            () =>
              Effect.gen(function*() {
                const counter = yield* Ref.make(0)
                const acquired = yield* Latch.make(false)
                const lock = yield* LeaderLock
                const holder = yield* Effect.forkChild(
                  lock.withLock('pipeline', Effect.andThen(acquired.open, Effect.never)),
                )
                yield* acquired.await
                return { counter, holder, acquired }
              }),
          ),
          When(
            `a ${row.kind} with a finite retry schedule runs against the held resource for one second of virtual time`,
          )(
            'readyOpen',
            (s) =>
              Match.value(row.kind).pipe(
                Match.when('worker', () =>
                  Effect.gen(function*() {
                    const worker = Daemon.poll({
                      name: 'infinite-cycle-worker',
                      work: Ref.update(s.state.counter, (n) => n + 1),
                      interval: Duration.millis(1),
                      lock: {
                        key: 'pipeline',
                        mode: 'required',
                        acquireRetryBackoff: quickCycleSchedule,
                      },
                      tick: { tickTimeout: Duration.seconds(90) },
                    })
                    yield* run.worker(worker)
                    yield* TestClock.adjust(Duration.seconds(1))
                    const countAfterContention = yield* Ref.get(s.state.counter)
                    yield* Fiber.interrupt(s.state.holder)
                    yield* TestClock.adjust(Duration.millis(200))
                    const countAfterRelease = yield* Ref.get(s.state.counter)
                    return { countAfterContention, countAfterRelease }
                  })),
                Match.when('supervisor', () =>
                  Effect.gen(function*() {
                    const child = Daemon.poll({
                      name: 'infinite-cycle-child',
                      work: Ref.update(s.state.counter, (n) => n + 1),
                      interval: Duration.millis(1),
                      tick: { tickTimeout: Duration.seconds(90) },
                      lock: { mode: 'none' },
                    })
                    const supervisor = oneForOne({
                      name: 'infinite-cycle-parent',
                      children: [child],
                      lock: {
                        key: 'pipeline',
                        mode: 'required',
                        acquireRetryBackoff: quickCycleSchedule,
                      },
                      supervision: Supervision.worker(Duration.minutes(5)),
                    })
                    const supHealth = yield* run.supervisor(supervisor)
                    yield* TestClock.adjust(Duration.seconds(1))
                    const countAfterContention = yield* Ref.get(s.state.counter)
                    yield* Fiber.interrupt(s.state.holder)
                    yield* TestClock.adjust(Duration.millis(200))
                    const countAfterRelease = yield* Ref.get(s.state.counter)
                    const ready = yield* supHealth.ready.await.pipe(
                      Effect.timeout('0 millis'),
                      Effect.matchEffect({
                        onFailure: () => Effect.succeed(false),
                        onSuccess: () => Effect.succeed(true),
                      }),
                    )
                    return { countAfterContention, countAfterRelease, ready }
                  })),
                Match.exhaustive,
              ),
          ),
          Then('no work executes while the lock is held')((s) =>
            Effect.sync(() => {
              expect(s.readyOpen.countAfterContention).toBe(0)
            })
          ),
          And('work eventually runs after the holder releases')((s) =>
            Effect.sync(() => {
              expect(s.readyOpen.countAfterRelease).toBeGreaterThan(0)
            })
          ),
        ),
    )
  })
