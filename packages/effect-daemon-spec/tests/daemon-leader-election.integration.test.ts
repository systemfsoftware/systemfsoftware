import { Noop } from '@systemfsoftware/effect-daemon-spec'
import type { LockConfig } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Deferred, Duration, Effect, Fiber, Layer, Match, Ref, Schedule, Stream } from 'effect'
import { TestClock } from 'effect/testing'

import { run } from '@systemfsoftware/effect-daemon-spec'
import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLockFake } from './__fixtures__/LeaderLockFake.js'

const Feature = makeFeature({ it })

Feature('Daemon Leader Election')
  .withLayer(Noop)
  .withScenarioLayer(
    Layer.mergeAll(
      LeaderLockFake,
      Noop,
    ),
  )
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'Optional-mode poll worker silently skips ticks while the lock key is held by another fiber',
      Gherkin.Do.pipe(
        Given('a counter and a fiber holding the "pipeline" lock indefinitely')(
          'state',
          () =>
            Effect.gen(function*() {
              const counter = yield* Ref.make(0)
              const lock = yield* LeaderLock
              const holderAcquired = yield* Deferred.make<void>()
              const holder = yield* Effect.forkChild(
                lock.withLock('pipeline', Effect.andThen(Deferred.succeed(holderAcquired, undefined), Effect.never)),
              )
              yield* Deferred.await(holderAcquired)
              return { counter, holder }
            }),
        ),
        When('an optional-mode poll worker runs against the held key for 100 ticks')(
          'count',
          (s) =>
            Effect.gen(function*() {
              const worker = Daemon.poll({
                name: 'optional-loser',
                work: Ref.update(s.state.counter, (n) => n + 1),
                interval: Duration.millis(1),
                lock: { key: 'pipeline', mode: 'optional' },
                tick: { tickTimeout: Duration.seconds(90) },
              })
              yield* run.worker(worker)
              yield* TestClock.adjust(Duration.millis(100))
              return yield* Ref.get(s.state.counter)
            }),
        ),
        Then(
          'the worker never executed its work while the lock was held, and the holder fiber is interrupted',
        )((s, expect) =>
          Effect.gen(function*() {
            yield* Fiber.interrupt(s.state.holder)
            yield* expect(s.count).toBe(0)
          })
        ),
      ),
    )

    scenario(
      'Required-mode poll worker fails immediately when the lock key is held by another fiber',
      Gherkin.Do.pipe(
        Given('a counter and a fiber holding the "pipeline" lock indefinitely')(
          'state',
          () =>
            Effect.gen(function*() {
              const counter = yield* Ref.make(0)
              const lock = yield* LeaderLock
              const holderAcquired = yield* Deferred.make<void>()
              const holder = yield* Effect.forkChild(
                lock.withLock('pipeline', Effect.andThen(Deferred.succeed(holderAcquired, undefined), Effect.never)),
              )
              yield* Deferred.await(holderAcquired)
              return { counter, holder }
            }),
        ),
        When('a required-mode poll worker is started against the held key')(
          'health',
          (s) =>
            Effect.gen(function*() {
              const worker = Daemon.poll({
                name: 'required-loser',
                work: Ref.update(s.state.counter, (n) => n + 1),
                interval: Duration.millis(1),
                lock: {
                  key: 'pipeline',
                  mode: 'required',
                  acquireRetryBackoff: Schedule.exponential(Duration.millis(10), 1),
                },
                tick: { tickTimeout: Duration.seconds(90) },
              })
              const health = yield* run.worker(worker)
              yield* TestClock.adjust(Duration.millis(100))
              return health
            }),
        ),
        Then(
          'the worker never executed its work while the lock was held, and the holder fiber is interrupted',
        )((s, expect) =>
          Effect.gen(function*() {
            const observed = yield* Ref.get(s.state.counter)
            yield* Fiber.interrupt(s.state.holder)
            yield* expect(observed).toBe(0)
          })
        ),
      ),
    )

    scenarioOutline(
      '<shape> worker with <mode> lock does not start while key is held',
      [
        { shape: 'stream', mode: 'optional' },
        { shape: 'stream', mode: 'required' },
        { shape: 'subscription', mode: 'optional' },
        { shape: 'subscription', mode: 'required' },
      ],
      (row) =>
        Gherkin.Do.pipe(
          Given('a held pipeline lock and observed worker side effects')(
            'state',
            () =>
              Effect.gen(function*() {
                const observed = yield* Ref.make(0)
                const acquired = yield* Deferred.make<void>()
                const lock = yield* LeaderLock
                const holder = yield* Effect.forkChild(
                  lock.withLock('pipeline', Effect.andThen(Deferred.succeed(acquired, undefined), Effect.never)),
                )
                yield* Deferred.await(acquired)
                return { observed, holder }
              }),
          ),
          When('a locked worker starts against the held key')(
            'health',
            (s) =>
              Effect.gen(function*() {
                let lockConfig: LockConfig
                if (row.mode === 'required') {
                  lockConfig = {
                    key: 'pipeline',
                    mode: 'required',
                    acquireRetryBackoff: Schedule.exponential(Duration.millis(10), 1),
                  }
                } else {
                  lockConfig = { key: 'pipeline', mode: 'optional' }
                }
                const worker = Match.value(row.shape).pipe(
                  Match.when('stream', () =>
                    Daemon.stream({
                      name: `${row.shape}-${row.mode}-loser`,
                      stream: Stream.fromEffect(Ref.update(s.state.observed, (n) => n + 1)),
                      lock: lockConfig,
                      tick: { tickTimeout: Duration.seconds(90) },
                    })),
                  Match.when('subscription', () =>
                    Daemon.subscription({
                      name: `${row.shape}-${row.mode}-loser`,
                      acquire: Ref.update(s.state.observed, (n) => n + 1),
                      lock: lockConfig,
                      tick: { tickTimeout: Duration.seconds(90) },
                    })),
                  Match.exhaustive,
                )
                const health = yield* run.worker(worker)
                return health
              }),
          ),
          Then(
            'worker side effects never run and the holder fiber is interrupted',
          )((s, expect) =>
            Effect.gen(function*() {
              const observed = yield* Ref.get(s.state.observed)
              yield* Fiber.interrupt(s.state.holder)
              yield* expect(observed).toBe(0)
            })
          ),
        ),
    )

    scenario(
      'A poll worker without lock config ticks regardless of held keys',
      Gherkin.Do.pipe(
        Given('a counter and a fiber holding the "pipeline" lock indefinitely')(
          'state',
          () =>
            Effect.gen(function*() {
              const counter = yield* Ref.make(0)
              const lock = yield* LeaderLock
              const holderAcquired = yield* Deferred.make<void>()
              const holder = yield* Effect.forkChild(
                lock.withLock('pipeline', Effect.andThen(Deferred.succeed(holderAcquired, undefined), Effect.never)),
              )
              yield* Deferred.await(holderAcquired)
              return { counter, holder }
            }),
        ),
        When('an unlocked poll worker runs against the held key')(
          'count',
          (s) =>
            Effect.gen(function*() {
              const firstTick = yield* Deferred.make<void>()
              const worker = Daemon.poll({
                name: 'unlocked',
                work: Effect.andThen(
                  Ref.update(s.state.counter, (n) => n + 1),
                  Deferred.succeed(firstTick, undefined),
                ),
                interval: Duration.millis(1),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              yield* run.worker(worker)
              yield* Deferred.await(firstTick)
              return yield* Ref.get(s.state.counter)
            }),
        ),
        Then(
          'the worker incremented on most ticks (the held key is irrelevant without lock config) and the holder fiber is interrupted',
        )((s, expect) =>
          Effect.gen(function*() {
            yield* Fiber.interrupt(s.state.holder)
            yield* expect(s.count).toBeGreaterThan(0)
          })
        ),
      ),
    )
  })
