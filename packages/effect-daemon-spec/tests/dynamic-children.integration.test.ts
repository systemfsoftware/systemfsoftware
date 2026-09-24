import { DynamicLimitExceeded } from '@systemfsoftware/effect-daemon-spec'
import { run } from '@systemfsoftware/effect-daemon-spec'
import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { dynamic } from '@systemfsoftware/effect-daemon-spec'
import { MaxChildren } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Deferred, Duration, Effect, HashSet, Latch, Match, Ref, Result, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { NoopLayer } from './__fixtures__/SharedLayers.js'

const Feature = makeFeature({ it })

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
        Then('the count is 3 and every child ID is distinct')((s, expect) =>
          Effect.gen(function*() {
            const count = yield* s.handle.count
            const ids = [s.refs.ref1.id, s.refs.ref2.id, s.refs.ref3.id]
            yield* expect({ count, ids }).toSatisfy(
              (observed) =>
                observed.count === 3 && HashSet.size(HashSet.fromIterable(observed.ids)) === observed.ids.length,
              'three children are active and the three child IDs are distinct',
            )
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
        Then('the result is Left DynamicLimitExceeded')((s, expect) =>
          expect(s.result).toEqual(Result.fail(DynamicLimitExceeded.make({ limit: 2 })))
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
        Then('the active child count is exactly 2')((s, expect) =>
          Effect.gen(function*() {
            yield* expect(yield* s.handle.count).toBe(2)
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
        Then('IDs are 0, 1, 2 in order')((s, expect) =>
          expect([s.refs.ref1.id, s.refs.ref2.id, s.refs.ref3.id]).toEqual([0, 1, 2])
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
        Then('later clock ticks do not run stopped child work')((s, expect) =>
          Effect.gen(function*() {
            yield* TestClock.adjust(Duration.millis(10))
            yield* expect(yield* Ref.get(s.ctx.ticks)).toBe(s.stoppedAt)
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
        Then('count is still 1')((s, expect) =>
          Effect.gen(function*() {
            yield* expect(yield* s.handle.count).toBe(1)
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
        Then('the child is tracked after start')((s, expect) =>
          expect(s.ctx.countAfterStart).toBeGreaterThanOrEqual(1)
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
        Then('two starts succeed and the third fails with DynamicLimitExceeded, whatever order they complete in')(
          (s, expect) =>
            expect({
              failures: s.results.results.flatMap((result) => (Result.isFailure(result) ? [result.failure] : [])),
              successes: s.results.results.filter((result) => Result.isSuccess(result)).length,
            }).toEqual({ failures: [DynamicLimitExceeded.make({ limit: 2 })], successes: 2 }),
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
        When('first child is stopped then a second is started')('observed', (s) =>
          Effect.gen(function*() {
            const firstRef = yield* s.ctx.handle.startChild(void 0)
            yield* s.ctx.acquired.await
            const countAtCapacity = yield* s.ctx.handle.count
            const atCapacity = yield* s.ctx.handle.startChild(void 0).pipe(Effect.result)
            yield* s.ctx.handle.stopChild(firstRef)
            yield* firstRef.removed
            const countAfterStop = yield* s.ctx.handle.count
            const secondRef = yield* s.ctx.handle.startChild(void 0)
            return { atCapacity, countAfterStop, countAtCapacity, secondRef }
          })),
        Then(
          'the first child is stopped, its capacity is reclaimed, and the second start succeeds with the next id',
        )((s, expect) =>
          expect({
            atCapacity: s.observed.atCapacity,
            countAfterStop: s.observed.countAfterStop,
            countAtCapacity: s.observed.countAtCapacity,
            secondId: s.observed.secondRef.id,
          }).toEqual({
            atCapacity: Result.fail(DynamicLimitExceeded.make({ limit: 1 })),
            countAfterStop: 0,
            countAtCapacity: 1,
            secondId: 1,
          })
        ),
      ),
    )

    scenario(
      'a finite child released among two long-running ones leaves active count at exactly two',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor whose finite child finishes when released')(
          'ctx',
          () =>
            Effect.gen(function*() {
              const gate = yield* Deferred.make<void>()
              const spec = dynamic({
                name: 'triplet-mixed',
                child: (slot: 0 | 1 | 2) =>
                  Match.value(slot).pipe(
                    Match.when(0, () =>
                      Daemon.stream({
                        name: 'finite-triplet',
                        stream: Stream.fromEffect(Deferred.await(gate)),
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
              return { handle, gate }
            }),
        ),
        When('three children start and the finite one is released to finish')('counts', (s) =>
          Effect.gen(function*() {
            const finiteRef = yield* s.ctx.handle.startChild(0)
            yield* s.ctx.handle.startChild(1)
            yield* s.ctx.handle.startChild(2)
            const countWhileAllRunning = yield* s.ctx.handle.count
            yield* Deferred.succeed(s.ctx.gate, undefined)
            yield* finiteRef.removed
            const countAfterFinish = yield* s.ctx.handle.count
            return { countAfterFinish, countWhileAllRunning }
          })),
        Then('all three children are active while they run and exactly two after the finite one finishes')(
          (s, expect) => expect(s.counts).toEqual({ countAfterFinish: 2, countWhileAllRunning: 3 }),
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
        When('one child is started and removal settles')('counts', (s) =>
          Effect.gen(function*() {
            const ref = yield* s.handle.startChild(void 0)
            yield* ref.removed
            const countAfterRemoval = yield* s.handle.count
            return { countAfterRemoval }
          })),
        Then('the count returns to zero once the immediately completing child is removed')((s, expect) =>
          expect(s.counts).toEqual({ countAfterRemoval: 0 })
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
        When('the child fails and cleanup settles')('counts', (s) =>
          Effect.gen(function*() {
            const ref = yield* s.handle.startChild(void 0)
            yield* ref.removed
            const countAfterRemoval = yield* s.handle.count
            return { countAfterRemoval }
          })),
        Then('the count falls to zero, then a new child is started and removed to the same zero')((s, expect) =>
          Effect.gen(function*() {
            const ref = yield* s.handle.startChild(void 0)
            yield* ref.removed
            const countAfterReuse = yield* s.handle.count
            return { ...s.counts, countAfterReuse }
          }).pipe(
            Effect.map((observed) => expect(observed).toEqual({ countAfterRemoval: 0, countAfterReuse: 0 })),
          )
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
        Then(
          'the ready and healthy latches stay open, a new child starts with the next id and leaves the count at zero',
        )((s, expect) =>
          Effect.gen(function*() {
            const ready = yield* s.ctx.handle.health.ready.await.pipe(Effect.timeout('0 millis'), Effect.result)
            const healthy = yield* s.ctx.handle.health.healthy.await.pipe(Effect.timeout('0 millis'), Effect.result)
            const ref2 = yield* s.ctx.handle.startChild(void 0)
            yield* ref2.removed
            const countAfterRemoval = yield* s.ctx.handle.count
            return { count: s.state.count, countAfterRemoval, healthy, ready, secondId: ref2.id }
          }).pipe(
            Effect.map((observed) =>
              expect(observed).toEqual({
                count: 0,
                countAfterRemoval: 0,
                healthy: expect.objectContaining({ _tag: 'Success', success: undefined }),
                ready: expect.objectContaining({ _tag: 'Success', success: undefined }),
                secondId: 1,
              })
            ),
          )
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
        Then('count remains 0')((s, expect) =>
          Effect.gen(function*() {
            yield* expect(yield* s.ctx.handle.count).toBe(0)
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
        Then('all three children are active and a fourth fails with DynamicLimitExceeded')((s, expect) =>
          Effect.gen(function*() {
            const fourth = yield* s.handle.startChild(void 0).pipe(Effect.result)
            return { active: s.countBefore.count, fourth }
          }).pipe(
            Effect.map((observed) =>
              expect(observed).toEqual({ active: 3, fourth: Result.fail(DynamicLimitExceeded.make({ limit: 3 })) })
            ),
          )
        ),
      ),
    )
  })
