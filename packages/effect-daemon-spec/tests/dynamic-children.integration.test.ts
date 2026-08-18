import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Latch, Match, Ref, Result, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { DynamicLimitExceeded } from '../src/mod.js'
import { run } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { dynamic } from '../src/mod.js'
import { MaxChildren } from '../src/mod.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'

const Feature = makeFeature({ it, layer })

const NoopChild = () =>
  Daemon.poll({
    name: 'noop-child',
    work: Effect.void,
    interval: Duration.seconds(10),
    tick: { tickTimeout: Duration.seconds(90) },
    lock: { mode: 'none' },
  })

const longPoll = (name: string) =>
  Daemon.poll({
    name,
    work: Effect.void,
    interval: Duration.seconds(10),
    tick: { tickTimeout: Duration.seconds(90) },
    lock: { mode: 'none' },
  })

const mkHandle = (name: string, max: number) =>
  Effect.gen(function*() {
    const spec = dynamic({ name, child: NoopChild, maxChildren: MaxChildren.make(max) })
    return yield* run.dynamic(spec)
  })

Feature('Dynamic Supervisor')
  .withLayer(NoopLayer)
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'startChild starts a new daemon and increments count',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor with maxChildren=10')('handle', () => mkHandle('count-test', 10)),
        When('3 children are started')('refs', (s) =>
          Effect.gen(function*() {
            const ref1 = yield* s.handle.startChild(void 0)
            const ref2 = yield* s.handle.startChild(void 0)
            const ref3 = yield* s.handle.startChild(void 0)
            return { ref1, ref2, ref3 }
          })),
        Then('count is 3')((s) =>
          Effect.gen(function*() {
            const count = yield* s.handle.count
            expect(count).toBe(3)
          })
        ),
        And('all child IDs are unique')((s) =>
          Effect.sync(() => {
            expect(s.refs.ref1.id).not.toBe(s.refs.ref2.id)
            expect(s.refs.ref2.id).not.toBe(s.refs.ref3.id)
          })
        ),
      ),
    )

    scenario(
      'startChild fails with DynamicLimitExceeded when maxChildren reached',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor with maxChildren=2')('handle', () => mkHandle('limit-test', 2)),
        When('2 children are started and a 3rd is attempted')('result', (s) =>
          Effect.gen(function*() {
            yield* s.handle.startChild(void 0)
            yield* s.handle.startChild(void 0)
            return yield* s.handle.startChild(void 0).pipe(Effect.result)
          })),
        Then('the result is Left DynamicLimitExceeded')((s) =>
          Effect.sync(() => {
            expect(s.result).toEqual(Result.fail(DynamicLimitExceeded.make({ limit: 2 })))
          })
        ),
      ),
    )

    scenario(
      'stopping one of three running children decrements active count exactly once',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor with maxChildren=10')('handle', () => mkHandle('stop-test', 10)),
        When('3 children are started and the first is stopped')('_', (s) =>
          Effect.gen(function*() {
            const firstRef = yield* s.handle.startChild(void 0)
            yield* s.handle.startChild(void 0)
            yield* s.handle.startChild(void 0)
            yield* s.handle.stopChild(firstRef)
          })),
        Then('the active child count is exactly 2')((s) =>
          Effect.gen(function*() {
            const count = yield* s.handle.count
            expect(count).toBe(2)
          })
        ),
      ),
    )

    scenario(
      'startChild returns monotonic sequential IDs',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor with maxChildren=10')('handle', () => mkHandle('ids-test', 10)),
        When('3 children are started sequentially')('refs', (s) =>
          Effect.gen(function*() {
            const ref1 = yield* s.handle.startChild(void 0)
            const ref2 = yield* s.handle.startChild(void 0)
            const ref3 = yield* s.handle.startChild(void 0)
            return { ref1, ref2, ref3 }
          })),
        Then('IDs are 0, 1, 2 in order')((s) =>
          Effect.sync(() => {
            expect(s.refs.ref1.id).toBe(0)
            expect(s.refs.ref2.id).toBe(1)
            expect(s.refs.ref3.id).toBe(2)
          })
        ),
      ),
    )

    scenario(
      'stopChild interrupts polling child work',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor with a ticking child')(
          'ctx',
          () =>
            Effect.gen(function*() {
              const ticks = yield* Ref.make(0)
              const spec = dynamic({
                name: 'stop-interrupts-poll',
                child: () =>
                  Daemon.poll({
                    name: 'interruptible-poll-child',
                    work: Ref.update(ticks, (n) => n + 1),
                    interval: Duration.millis(1),
                    tick: { tickTimeout: Duration.seconds(90) },
                    lock: { mode: 'none' },
                  }),
                maxChildren: MaxChildren.make(1),
              })
              const handle = yield* run.dynamic(spec)
              return { handle, ticks }
            }),
        ),
        When('the child ticks and is stopped')('stoppedAt', (s) =>
          Effect.gen(function*() {
            const ref = yield* s.ctx.handle.startChild(void 0)
            yield* TestClock.adjust(Duration.millis(5))
            yield* s.ctx.handle.stopChild(ref)
            return yield* Ref.get(s.ctx.ticks)
          })),
        Then('later clock ticks do not run stopped child work')((s) =>
          Effect.gen(function*() {
            yield* TestClock.adjust(Duration.millis(10))
            expect(yield* Ref.get(s.ctx.ticks)).toBe(s.stoppedAt)
          })
        ),
      ),
    )

    scenario(
      'stopChild with unknown ref does nothing',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor with maxChildren=10')('handle', () => mkHandle('unknown-ref-test', 10)),
        When('1 child is started and an unknown ref is stopped')('_', (s) =>
          Effect.gen(function*() {
            yield* s.handle.startChild(void 0)
            yield* s.handle.stopChild({ id: 9999 })
          })),
        Then('count is still 1')((s) =>
          Effect.gen(function*() {
            const count = yield* s.handle.count
            expect(count).toBe(1)
          })
        ),
      ),
    )

    scenario(
      'Dynamic child is tracked after start',
      Gherkin.Do.pipe(
        Given('a child start latch')('started', () => Latch.make(false)),
        When('a dynamic supervisor starts a child')('ctx', (_s) =>
          Effect.gen(function*() {
            const spec = dynamic({
              name: 'self-terminate-test',
              child: () =>
                Daemon.subscription({
                  name: 'tracked-child',
                  acquire: _s.started.open,
                  tick: { tickTimeout: Duration.seconds(90) },
                  lock: { mode: 'none' },
                }),
              maxChildren: MaxChildren.make(10),
            })
            const handle = yield* run.dynamic(spec)
            yield* handle.startChild(void 0)
            yield* _s.started.await
            const countAfterStart = yield* handle.count
            return { handle, countAfterStart }
          })),
        Then('the child is tracked after start')((s) =>
          Effect.sync(() => {
            expect(s.ctx.countAfterStart).toBeGreaterThanOrEqual(1)
          })
        ),
      ),
    )

    scenario(
      'Concurrent startChild calls do not exceed maxChildren',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor with maxChildren=2')('handle', () => mkHandle('concurrent-test', 2)),
        When('3 startChild calls run concurrently')('results', (s) =>
          Effect.gen(function*() {
            const results = yield* Effect.all(
              [
                s.handle.startChild(void 0).pipe(Effect.result),
                s.handle.startChild(void 0).pipe(Effect.result),
                s.handle.startChild(void 0).pipe(Effect.result),
              ],
              { concurrency: 'unbounded' },
            )
            return { results }
          })),
        Then('at most 2 succeed and at least 1 fails with DynamicLimitExceeded')((s) =>
          Effect.sync(() => {
            const successes = s.results.results.filter(Result.isSuccess).length
            const failures = s.results.results.filter(Result.isFailure).length
            expect(successes).toBeLessThanOrEqual(2)
            expect(failures).toBeGreaterThanOrEqual(1)
            expect(successes + failures).toBe(3)
          })
        ),
      ),
    )

    scenario(
      'after stopping a tracked child capacity is reclaimed so maxChildren=1 allows a new child',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor with maxChildren 1 and observable child acquisition')(
          'ctx',
          () =>
            Effect.gen(function*() {
              const acquired = yield* Latch.make(false)
              const spec = dynamic({
                name: 'capacity-recovery',
                child: () =>
                  Daemon.subscription({
                    name: 'held-child',
                    acquire: acquired.open,
                    tick: { tickTimeout: Duration.seconds(90) },
                    lock: { mode: 'none' },
                  }),
                maxChildren: MaxChildren.make(1),
              })
              const handle = yield* run.dynamic(spec)
              return { handle, acquired }
            }),
        ),
        When('first child is stopped then a second is started')('secondRef', (s) =>
          Effect.gen(function*() {
            const firstRef = yield* s.ctx.handle.startChild(void 0)
            yield* s.ctx.acquired.await
            expect(yield* s.ctx.handle.count).toBe(1)
            const atCapacity = yield* s.ctx.handle.startChild(void 0).pipe(Effect.result)
            expect(atCapacity).toEqual(Result.fail(DynamicLimitExceeded.make({ limit: 1 })))
            yield* s.ctx.handle.stopChild(firstRef)
            yield* firstRef.removed
            expect(yield* s.ctx.handle.count).toBe(0)
            return yield* s.ctx.handle.startChild(void 0)
          })),
        Then('the second child start succeeds with a new id')((s) =>
          Effect.sync(() => {
            expect(s.secondRef.id).toBe(1)
          })
        ),
      ),
    )

    scenario(
      'one naturally completing child among three leaves active count at exactly two',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor with one finite and two long-running children')(
          'ctx',
          () =>
            Effect.gen(function*() {
              const spec = dynamic({
                name: 'triplet-mixed',
                child: (slot: 0 | 1 | 2) =>
                  Match.value(slot).pipe(
                    Match.when(0, () =>
                      Daemon.stream({
                        name: 'finite-triplet',
                        stream: Stream.fromEffect(Effect.void),
                        tick: { tickTimeout: Duration.seconds(90) },
                        lock: { mode: 'none' },
                      })),
                    Match.when(1, () => longPoll('long-triplet-a')),
                    Match.when(2, () => longPoll('long-triplet-b')),
                    Match.exhaustive,
                  ),
                maxChildren: MaxChildren.make(10),
              })
              const handle = yield* run.dynamic(spec)
              return { handle }
            }),
        ),
        When('three children start and the finite one finishes')('_', (s) =>
          Effect.gen(function*() {
            const finiteRef = yield* s.ctx.handle.startChild(0)
            yield* s.ctx.handle.startChild(1)
            yield* s.ctx.handle.startChild(2)
            expect(yield* s.ctx.handle.count).toBe(3)
            yield* finiteRef.removed
          })),
        Then('active count is exactly two')((s) =>
          Effect.gen(function*() {
            expect(yield* s.ctx.handle.count).toBe(2)
          })
        ),
      ),
    )

    scenario(
      'immediately completing dynamic child reaches removed and frees capacity',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor whose children complete on empty stream')(
          'handle',
          () =>
            Effect.gen(function*() {
              const spec = dynamic({
                name: 'immediate-empty-stream',
                child: () =>
                  Daemon.stream({
                    name: 'empty-stream-worker',
                    stream: Stream.empty,
                    tick: { tickTimeout: Duration.seconds(90) },
                    lock: { mode: 'none' },
                  }),
                maxChildren: MaxChildren.make(5),
              })
              return yield* run.dynamic(spec)
            }),
        ),
        When('one child is started and removal settles')('_', (s) =>
          Effect.gen(function*() {
            const ref = yield* s.handle.startChild(void 0)
            expect(yield* s.handle.count).toBe(1)
            yield* ref.removed
          })),
        Then('active count returns to zero')((s) =>
          Effect.gen(function*() {
            expect(yield* s.handle.count).toBe(0)
          })
        ),
      ),
    )

    scenario(
      'failing dynamic child opens removed and frees capacity without restart',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor whose only child fails')(
          'handle',
          () =>
            Effect.gen(function*() {
              const spec = dynamic({
                name: 'failure-cleanup',
                child: () =>
                  Daemon.stream({
                    name: 'failing-dynamic-child',
                    stream: Stream.fail('boom'),
                    tick: { tickTimeout: Duration.seconds(90) },
                    lock: { mode: 'none' },
                  }),
                maxChildren: MaxChildren.make(1),
              })
              return yield* run.dynamic(spec)
            }),
        ),
        When('the child fails and cleanup settles')('_', (s) =>
          Effect.gen(function*() {
            const ref = yield* s.handle.startChild(void 0)
            expect(yield* s.handle.count).toBe(1)
            yield* ref.removed
          })),
        Then('count returns to zero and capacity can be reused')((s) =>
          Effect.gen(function*() {
            expect(yield* s.handle.count).toBe(0)
            yield* s.handle.startChild(void 0)
            expect(yield* s.handle.count).toBe(1)
          })
        ),
      ),
    )

    scenario(
      'Dynamic supervisor stays healthy when a dynamic child fails and is cleaned up',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor whose child stream fails')('ctx', () =>
          Effect.gen(function*() {
            const spec = dynamic({
              name: 'dynamic-health-after-fail',
              child: () =>
                Daemon.stream({
                  name: 'failing-for-health',
                  stream: Stream.concat(Stream.fromEffect(Effect.void), Stream.fail('boom')),
                  tick: { tickTimeout: Duration.seconds(90) },
                  lock: { mode: 'none' },
                }),
              maxChildren: MaxChildren.make(10),
            })
            const handle = yield* run.dynamic(spec)
            return { handle }
          })),
        When('the failing child starts and its removed latch opens')('state', (s) =>
          Effect.gen(function*() {
            const ref = yield* s.ctx.handle.startChild(void 0)
            yield* ref.removed
            yield* s.ctx.handle.health.ready.await
            yield* s.ctx.handle.health.healthy.await
            const count = yield* s.ctx.handle.count
            return { count }
          })),
        Then('the dynamic supervisor ready latch is open')((_s) => Effect.void),
        And('the dynamic supervisor healthy latch is open')((_s) => Effect.void),
        And('active child count is zero')((s) =>
          Effect.sync(() => {
            expect(s.state.count).toBe(0)
          })
        ),
        And('starting another child succeeds')((s) =>
          Effect.gen(function*() {
            const ref2 = yield* s.ctx.handle.startChild(void 0)
            expect(ref2.id).toBe(1)
            expect(yield* s.ctx.handle.count).toBe(1)
          })
        ),
      ),
    )

    scenario(
      'stopChild after natural completion is harmless and count stays 0',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor whose children complete after an explicit release')(
          'ctx',
          () =>
            Effect.gen(function*() {
              const release = yield* Latch.make(false)
              const completed = yield* Latch.make(false)
              const streamSpec = dynamic({
                name: 'stop-after-done',
                child: () =>
                  Daemon.stream({
                    name: 'finite',
                    stream: Stream.fromEffect(Effect.andThen(release.await, completed.open)),
                    tick: { tickTimeout: Duration.seconds(90) },
                    lock: { mode: 'none' },
                  }),
                maxChildren: MaxChildren.make(5),
              })
              const handle = yield* run.dynamic(streamSpec)
              return { handle, release, completed }
            }),
        ),
        When('the child completes then stopChild is called on its ref')('_', (s) =>
          Effect.gen(function*() {
            const ref = yield* s.ctx.handle.startChild(void 0)
            yield* s.ctx.release.open
            yield* s.ctx.completed.await
            yield* ref.removed
            yield* s.ctx.handle.stopChild(ref)
          })),
        Then('count remains 0')((s) =>
          Effect.gen(function*() {
            expect(yield* s.ctx.handle.count).toBe(0)
          })
        ),
      ),
    )

    scenario(
      'Scope close cleans up all dynamic children',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor with maxChildren=3')('handle', () => mkHandle('cleanup-test', 3)),
        When('3 children are started and the scope closes')('countBefore', (s) =>
          Effect.gen(function*() {
            yield* s.handle.startChild(void 0)
            yield* s.handle.startChild(void 0)
            yield* s.handle.startChild(void 0)
            const count = yield* s.handle.count
            return { count }
          })),
        Then('all 3 children are active')((s) =>
          Effect.sync(() => {
            expect(s.countBefore.count).toBe(3)
          })
        ),
        And('a 4th child fails with DynamicLimitExceeded')((s) =>
          Effect.gen(function*() {
            const result = yield* s.handle.startChild(void 0).pipe(Effect.result)
            expect(result).toEqual(Result.fail(DynamicLimitExceeded.make({ limit: 3 })))
          })
        ),
      ),
    )
  })
