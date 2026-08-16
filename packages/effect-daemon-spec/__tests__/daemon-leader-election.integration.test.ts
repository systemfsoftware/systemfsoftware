import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Fiber, Latch, Layer, Match, Ref, Schedule, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { Noop } from '../src/daemon-reporter.adapter.js'
import type { LockConfig } from '../src/mod.js'

import { run } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { LeaderLock } from '../src/mod.js'
import { LeaderLockFake } from './helpers/leader-lock-fake.js'

const Feature = makeFeature({ it, layer })

Feature('Daemon Leader Election')
  .withLayer(Noop)
  .withScenarioLayer(
    Layer.mergeAll(
      LeaderLockFake,
      TestClock.layer(),
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
              const holder = yield* Effect.forkChild(lock.withLock('pipeline', Effect.never))
              yield* Effect.yieldNow
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
        Then('the worker never executed its work because the lock was always held')((s) =>
          Effect.sync(() => {
            expect(s.count).toBe(0)
          })
        ),
        And('the holder fiber is interrupted')((s) => Fiber.interrupt(s.state.holder)),
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
              const holder = yield* Effect.forkChild(lock.withLock('pipeline', Effect.never))
              yield* Effect.yieldNow
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
        Then('the worker never executed its work because the lock was always held')((s) =>
          Ref.get(s.state.counter).pipe(
            Effect.flatMap((count) =>
              Effect.sync(() => {
                expect(count).toBe(0)
              })
            ),
          )
        ),
        And('the holder fiber is interrupted')((s) => Fiber.interrupt(s.state.holder)),
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
                const acquired = yield* Latch.make(false)
                const lock = yield* LeaderLock
                const holder = yield* Effect.forkChild(
                  lock.withLock('pipeline', Effect.andThen(acquired.open, Effect.never)),
                )
                yield* acquired.await
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
                yield* TestClock.adjust(Duration.millis(10))
                return health
              }),
          ),
          Then('worker side effects never run')((s) =>
            Effect.gen(function*() {
              expect(yield* Ref.get(s.state.observed)).toBe(0)
            })
          ),
          And('the holder fiber is interrupted')((s) => Fiber.interrupt(s.state.holder)),
        ),
    )

    scenario(
      'A poll worker without lock config runs every tick regardless of held keys',
      Gherkin.Do.pipe(
        Given('a counter and a fiber holding the "pipeline" lock indefinitely')(
          'state',
          () =>
            Effect.gen(function*() {
              const counter = yield* Ref.make(0)
              const lock = yield* LeaderLock
              const holder = yield* Effect.forkChild(lock.withLock('pipeline', Effect.never))
              yield* Effect.yieldNow
              return { counter, holder }
            }),
        ),
        When('an unlocked poll worker runs for 50 ticks')(
          'count',
          (s) =>
            Effect.gen(function*() {
              const worker = Daemon.poll({
                name: 'unlocked',
                work: Ref.update(s.state.counter, (n) => n + 1),
                interval: Duration.millis(1),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              yield* run.worker(worker)
              yield* TestClock.adjust(Duration.millis(50))
              return yield* Ref.get(s.state.counter)
            }),
        ),
        Then('the worker incremented on most ticks (held key is irrelevant without lock config)')((s) =>
          Effect.sync(() => {
            expect(s.count).toBeGreaterThan(0)
          })
        ),
        And('the holder fiber is interrupted')((s) => Fiber.interrupt(s.state.holder)),
      ),
    )
  })
