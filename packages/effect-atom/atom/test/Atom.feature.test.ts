import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec-v4'
import { Effect, Latch, Layer, Option, Schema, Stream, SubscriptionRef } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'
import { expect, vi } from 'vitest'
import * as Atom from '../src/Atom.js'
import * as Registry from '../src/Registry.js'
import * as Result from '../src/Result.js'

const Feature = makeFeature({ it, layer })

Feature('Deriving values from other values on a page')
  .body(({ scenario }) => {
    scenario(
      'A plain value on the page reads back exactly what was set',
      Gherkin.Do.pipe(
        Given('a page holding a constant value')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(42)
            const page = Registry.make()
            return { page, value }
          })),
        When('the value is read')('reading', (s) => Effect.sync(() => s.ctx.page.get(s.ctx.value))),
        Then('it matches what was set')((s) => {
          expect(s.reading).toBe(42)
        }),
      ),
    )

    scenario(
      'A value computed from another value stays in sync with it',
      Gherkin.Do.pipe(
        Given('a page with a value doubled from another value')('ctx', () =>
          Effect.sync(() => {
            const base = Atom.make(10)
            const doubled = Atom.map(base, (n) => n * 2)
            const page = Registry.make()
            return { page, doubled }
          })),
        When('the doubled value is read')('reading', (s) => Effect.sync(() => s.ctx.page.get(s.ctx.doubled))),
        Then('it reflects the source value doubled')((s) => {
          expect(s.reading).toBe(20)
        }),
      ),
    )

    scenario(
      'Two items with different keys get their own independent values',
      Gherkin.Do.pipe(
        Given('a page with a value that depends on which item is being shown')('ctx', () =>
          Effect.sync(() => {
            const lengthOfName = Atom.family((name: string) => Atom.make(name.length))
            const page = Registry.make()
            return { page, lengthOfName }
          })),
        When('the value is read for two different items')('readings', (s) =>
          Effect.sync(() => ({
            first: s.ctx.page.get(s.ctx.lengthOfName('foo')),
            second: s.ctx.page.get(s.ctx.lengthOfName('bar')),
          }))),
        Then('each item keeps its own value')((s) => {
          expect(s.readings.first).toBe(3)
          expect(s.readings.second).toBe(3)
        }),
      ),
    )

    scenario(
      'A value that never finishes loading still reports loading after being asked to refresh',
      Gherkin.Do.pipe(
        Given('a page with a value that never finishes loading')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(Effect.never)
            const page = Registry.make()
            return { page, value }
          })),
        When('the value is read, then the page is asked to refresh it, then read again')(
          'readings',
          (s) =>
            Effect.sync(() => {
              const firstReading = s.ctx.page.get(s.ctx.value)
              s.ctx.page.refresh(s.ctx.value)
              const secondReading = s.ctx.page.get(s.ctx.value)
              return { firstReading, secondReading }
            }),
        ),
        Then('both readings show it is still loading')((s) => {
          expect(Result.isInitial(s.readings.firstReading)).toBe(true)
          expect(Result.isInitial(s.readings.secondReading)).toBe(true)
        }),
      ),
    )
  })

Feature('Showing a stand-in while a value loads')
  .body(({ scenario }) => {
    scenario(
      'A value with a stand-in shows the stand-in while the source is still loading',
      Gherkin.Do.pipe(
        Given('a source that is still loading and a stand-in value')('ctx', () =>
          Effect.sync(() => {
            const source = Atom.make(Effect.never)
            const withStandIn = source.pipe(Atom.withFallback(Atom.make(Result.success('cached' as const))))
            const page = Registry.make()
            return { page, withStandIn }
          })),
        When('the value is read before the source finishes')(
          'reading',
          (s) => Effect.sync(() => s.ctx.page.get(s.ctx.withStandIn)),
        ),
        Then('the stand-in is shown, marked as still loading')((s) => {
          expect(Result.isSuccess(s.reading) && s.reading.value === 'cached' && s.reading.waiting).toBe(true)
        }),
      ),
    )

    scenario(
      'Once the source finishes, its real outcome replaces the stand-in',
      Gherkin.Do.pipe(
        Given('a source that fails and a stand-in value')('ctx', () =>
          Effect.sync(() => {
            const source = Atom.make(Effect.fail('down' as const))
            const withStandIn = source.pipe(Atom.withFallback(Atom.make(Result.success('cached' as const))))
            const page = Registry.make()
            return { page, withStandIn }
          })),
        When('the value is read after the source has settled')('reading', (s) =>
          Effect.sync(() => {
            s.ctx.page.get(s.ctx.withStandIn)
            s.ctx.page.refresh(s.ctx.withStandIn)
            return s.ctx.page.get(s.ctx.withStandIn)
          })),
        Then('the real failure is shown, not the stand-in')((s) => {
          expect(Result.isFailure(s.reading)).toBe(true)
        }),
      ),
    )
  })

Feature('Keeping the page responsive while a change is confirmed in the background')
  .body(({ scenario }) => {
    scenario(
      'A change shows up right away and disappears when the confirmation is rejected',
      Gherkin.Do.pipe(
        Given('a stored value with optimistic updates, and a confirmation that will be rejected')(
          'ctx',
          () =>
            Effect.sync(() => {
              const latch = Latch.makeUnsafe()
              let stored = 1
              const source = Atom.make(() => stored)
              const optimisticValue = source.pipe(Atom.optimistic)
              const save = optimisticValue.pipe(
                Atom.optimisticFn({
                  reducer: (_current, update: number) => update,
                  fn: Atom.fn(Effect.fnUntraced(function*() {
                    yield* latch.await
                    return yield* Effect.fail('rejected' as const)
                  })),
                }),
                Atom.keepAlive,
              )
              const page = Registry.make()
              return {
                page,
                save,
                optimisticValue,
                latch,
                setStored: (n: number) => {
                  stored = n
                },
              }
            }),
        ),
        When('the change is made and the rejection arrives')('readings', (s) =>
          Effect.gen(function*() {
            const before = s.ctx.page.get(s.ctx.optimisticValue)
            s.ctx.page.set(s.ctx.save, 99)
            const whilePending = s.ctx.page.get(s.ctx.optimisticValue)
            s.ctx.latch.openUnsafe()
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const afterRejection = s.ctx.page.get(s.ctx.optimisticValue)
            return { before, whilePending, afterRejection }
          })),
        Then('the change showed immediately, then rolled back to the stored value')((s) => {
          expect(s.readings.before).toBe(1)
          expect(s.readings.whilePending).toBe(99)
          expect(s.readings.afterRejection).toBe(1)
        }),
      ),
    )

    scenario(
      'A change that is confirmed stays, refreshed from the store',
      Gherkin.Do.pipe(
        Given('a stored value with optimistic updates, and a confirmation that will be accepted')(
          'ctx',
          () =>
            Effect.sync(() => {
              const latch = Latch.makeUnsafe()
              let stored = 1
              const source = Atom.make(() => stored)
              const optimisticValue = source.pipe(Atom.optimistic)
              const save = optimisticValue.pipe(
                Atom.optimisticFn({
                  reducer: (_current, update: number) => update,
                  fn: Atom.fn(Effect.fnUntraced(function*() {
                    yield* latch.await
                  })),
                }),
                Atom.keepAlive,
              )
              const page = Registry.make()
              return {
                page,
                save,
                optimisticValue,
                latch,
                setStored: (n: number) => {
                  stored = n
                },
              }
            }),
        ),
        When('the change is made and the store accepts it')('readings', (s) =>
          Effect.gen(function*() {
            s.ctx.page.set(s.ctx.save, 99)
            const whilePending = s.ctx.page.get(s.ctx.optimisticValue)
            s.ctx.setStored(99)
            s.ctx.latch.openUnsafe()
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const afterConfirmation = s.ctx.page.get(s.ctx.optimisticValue)
            return { whilePending, afterConfirmation }
          })),
        Then('the confirmed value stays on screen')((s) => {
          expect(s.readings.whilePending).toBe(99)
          expect(s.readings.afterConfirmation).toBe(99)
        }),
      ),
    )
  })

Feature('Grouping rapid changes into a single update')
  .body(({ scenario }) => {
    scenario(
      'A burst of quick edits arrives as one final value',
      Gherkin.Do.pipe(
        Given('a value that only updates after things quiet down')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            const base = Atom.make(0)
            const quieted = base.pipe(Atom.debounce(100))
            const page = Registry.make()
            page.mount(quieted)
            return { page, base, quieted }
          })),
        When('several edits happen in quick succession, then things go quiet')('readings', (s) =>
          Effect.sync(() => {
            s.ctx.page.set(s.ctx.base, 1)
            s.ctx.page.set(s.ctx.base, 2)
            s.ctx.page.set(s.ctx.base, 3)
            const duringBurst = s.ctx.page.get(s.ctx.quieted)
            vi.advanceTimersByTime(150)
            const afterQuiet = s.ctx.page.get(s.ctx.quieted)
            vi.useRealTimers()
            return { duringBurst, afterQuiet }
          })),
        Then('nothing changed during the burst, and the final edit arrived once it was quiet')((s) => {
          expect(s.readings.duringBurst).toBe(0)
          expect(s.readings.afterQuiet).toBe(3)
        }),
      ),
    )
  })

Feature('Cleaning up values on their own schedules')
  .body(({ scenario }) => {
    scenario(
      'A value with a short custom timer is cleaned up even when the page default is long',
      Gherkin.Do.pipe(
        Given('a value with its own short cleanup timer on a page with a long default')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            let starts = 0
            const value = Atom.make(Effect.sync(() => {
              starts++
              return 1
            })).pipe(Atom.setIdleTTL(10))
            const page = Registry.make({ defaultIdleTTL: 10_000, timeoutResolution: 10 })
            return { page, value, starts: () => starts }
          })),
        When('the value is read, its short timer runs out, and it is read again')('readings', (s) =>
          Effect.sync(() => {
            s.ctx.page.get(s.ctx.value)
            vi.advanceTimersByTime(100)
            s.ctx.page.get(s.ctx.value)
            const starts = s.ctx.starts()
            vi.useRealTimers()
            return { starts }
          })),
        Then('the value was cleaned up on its own schedule and started over')((s) => {
          expect(s.readings.starts).toBe(2)
        }),
      ),
    )

    scenario(
      'A family member nobody uses is cleaned up while the family lives on',
      Gherkin.Do.pipe(
        Given('a family of values with a short cleanup timer')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            let starts = 0
            const family = Atom.family((id: number) =>
              Atom.make(Effect.callback<number>((resume) => {
                starts++
                resume(Effect.succeed(id))
              }))
            )
            const page = Registry.make({ defaultIdleTTL: 10 })
            return { page, family, starts: () => starts }
          })),
        When('one member is read, the timer runs out, and it is read again')('readings', (s) =>
          Effect.sync(() => {
            const first = s.ctx.page.get(s.ctx.family(7))
            vi.advanceTimersByTime(100)
            const second = s.ctx.page.get(s.ctx.family(7))
            const starts = s.ctx.starts()
            vi.useRealTimers()
            return { first, second, starts }
          })),
        Then('the member was cleaned up and recreated on demand')((s) => {
          expect(s.readings.starts).toBe(2)
        }),
      ),
    )
  })

Feature('Watching a continuous feed of updates')
  .body(({ scenario }) => {
    scenario(
      'A reader following a feed sees every update arrive in order',
      Gherkin.Do.pipe(
        Given('a feed of three updates')('ctx', () =>
          Effect.sync(() => {
            const feed = Atom.pull(Stream.make(1, 2, 3))
            const page = Registry.make()
            page.mount(feed)
            return { page, feed }
          })),
        When('the reader pulls until the feed finishes')('final', (s) =>
          Effect.gen(function*() {
            s.ctx.page.set(s.ctx.feed, void 0)
            yield* Effect.yieldNow
            s.ctx.page.set(s.ctx.feed, void 0)
            yield* Effect.yieldNow
            s.ctx.page.set(s.ctx.feed, void 0)
            yield* Effect.yieldNow
            s.ctx.page.set(s.ctx.feed, void 0)
            yield* Effect.yieldNow
            return s.ctx.page.get(s.ctx.feed)
          })),
        Then('every update arrived in order and the feed is marked finished')((s) => {
          expect(Result.isSuccess(s.final)).toBe(true)
          if (Result.isSuccess(s.final)) {
            expect(s.final.value.done).toBe(true)
            expect([...s.final.value.items]).toEqual([1, 2, 3])
          }
        }),
      ),
    )
  })

Feature('A live view that tracks a changing source')
  .body(({ scenario }) => {
    scenario(
      'A view backed by a shared reference shows every change as it happens',
      Gherkin.Do.pipe(
        Given('a view backed by a shared reference')('ctx', () =>
          Effect.gen(function*() {
            const ref = yield* SubscriptionRef.make(0)
            const view = Atom.subscriptionRef(ref)
            const page = Registry.make()
            page.mount(view)
            return { ref, view, page }
          })),
        When('the reference changes twice')('readings', (s) =>
          Effect.gen(function*() {
            yield* SubscriptionRef.set(s.ctx.ref, 5)
            const first = s.ctx.page.get(s.ctx.view)
            yield* SubscriptionRef.set(s.ctx.ref, 9)
            const second = s.ctx.page.get(s.ctx.view)
            return { first, second }
          })),
        Then('the view tracked both changes')((s) => {
          expect(s.readings.first).toBe(5)
          expect(s.readings.second).toBe(9)
        }),
      ),
    )
  })

Feature('Remembering a value in the key-value store')
  .body(({ scenario }) => {
    scenario(
      'A value remembered in the store is still there on a fresh page',
      Gherkin.Do.pipe(
        Given('a remembered value backed by an in-memory store')('ctx', () =>
          Effect.sync(() => {
            const memoMap = Layer.makeMemoMapUnsafe()
            const runtime = Atom.context({ memoMap })(KeyValueStore.layerMemory)
            const remembered = Atom.kvs({
              runtime,
              key: 'count',
              schema: Schema.Number,
              defaultValue: () => 0,
            })
            const page = Registry.make()
            return { remembered, page }
          })),
        When('the value is changed and a fresh page reads it')('readings', (s) =>
          Effect.gen(function*() {
            s.ctx.page.mount(s.ctx.remembered)
            yield* Effect.yieldNow
            s.ctx.page.set(s.ctx.remembered, 42)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const freshPage = Registry.make()
            freshPage.mount(s.ctx.remembered)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            return { onFreshPage: freshPage.get(s.ctx.remembered) }
          })),
        Then('the fresh page sees the remembered value')((s) => {
          expect(s.readings.onFreshPage).toBe(42)
        }),
      ),
    )
  })

Feature('Reading a value from the page address when there is no address bar')
  .body(({ scenario }) => {
    scenario(
      'A value remembered in the page address reads as empty when there is no address bar',
      Gherkin.Do.pipe(
        Given('a value remembered in the page address')('ctx', () =>
          Effect.sync(() => {
            const plain = Atom.searchParam('q')
            const decoded = Atom.searchParam('n', { schema: Schema.NumberFromString })
            const page = Registry.make()
            return { plain, decoded, page }
          })),
        When('the values are read and written with no address bar available')('readings', (s) =>
          Effect.sync(() => {
            const plainBefore = s.ctx.page.get(s.ctx.plain)
            const decodedBefore = s.ctx.page.get(s.ctx.decoded)
            s.ctx.page.set(s.ctx.plain, 'hello')
            const plainAfter = s.ctx.page.get(s.ctx.plain)
            return { plainBefore, decodedBefore, plainAfter }
          })),
        Then('both read as empty, and a write keeps the value locally')((s) => {
          expect(s.readings.plainBefore).toBe('')
          expect(Option.isNone(s.readings.decodedBefore)).toBe(true)
          expect(s.readings.plainAfter).toBe('hello')
        }),
      ),
    )
  })

Feature('Refreshing a value that has gone stale')
  .body(({ scenario }) => {
    scenario(
      'A value past its stale time refreshes itself when read again',
      Gherkin.Do.pipe(
        Given('a stored value that goes stale quickly')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            let stored = 1
            const source = Atom.make(Effect.sync(() => stored))
            const staleAware = source.pipe(Atom.swr({ staleTime: 100 }))
            const page = Registry.make()
            return {
              page,
              staleAware,
              setStored: (n: number) => {
                stored = n
              },
            }
          })),
        When('the value goes stale, the store changes, and the value is read again')(
          'readings',
          (s) =>
            Effect.sync(() => {
              s.ctx.page.get(s.ctx.staleAware)
              s.ctx.page.refresh(s.ctx.staleAware)
              const fresh = s.ctx.page.get(s.ctx.staleAware)
              s.ctx.setStored(2)
              vi.advanceTimersByTime(200)
              s.ctx.page.get(s.ctx.staleAware)
              const revalidated = s.ctx.page.get(s.ctx.staleAware)
              vi.useRealTimers()
              return { fresh, revalidated }
            }),
        ),
        Then('the first read was fresh, and the stale read refreshed to the new value')((s) => {
          expect(Result.isSuccess(s.readings.fresh) && s.readings.fresh.value === 1).toBe(true)
          expect(Result.isSuccess(s.readings.revalidated) && s.readings.revalidated.value === 2).toBe(true)
        }),
      ),
    )
  })

Feature('Sharing one member across a family')
  .body(({ scenario }) => {
    scenario(
      'Asking a family for the same member twice gives the very same member',
      Gherkin.Do.pipe(
        Given('a family of values')('ctx', () =>
          Effect.sync(() => {
            const family = Atom.family((id: number) => Atom.make(id * 10))
            return { family }
          })),
        When('the same member is asked for twice')(
          'members',
          (s) => Effect.sync(() => ({ first: s.ctx.family(1), second: s.ctx.family(1) })),
        ),
        Then('both asks returned the same member')((s) => {
          expect(s.members.first).toBe(s.members.second)
        }),
      ),
    )
  })

Feature('Reporting progress while a change is confirmed in the background')
  .body(({ scenario }) => {
    scenario(
      'A change whose confirmation is still running reports itself as in flight',
      Gherkin.Do.pipe(
        Given('a stored value with optimistic updates that report their progress')('ctx', () =>
          Effect.sync(() => {
            const latch = Latch.makeUnsafe()
            let stored = 1
            const source = Atom.make(Effect.sync(() => stored))
            const optimisticValue = source.pipe(Atom.optimistic)
            const save = optimisticValue.pipe(
              Atom.optimisticFn({
                reducer: (_current, update: number) => Result.success(update, { waiting: true }),
                fn: Atom.fn(Effect.fnUntraced(function*() {
                  yield* latch.await
                })),
              }),
              Atom.keepAlive,
            )
            const page = Registry.make()
            return {
              page,
              save,
              optimisticValue,
              latch,
              setStored: (n: number) => {
                stored = n
              },
            }
          })),
        When('the change is made and the store accepts it')('readings', (s) =>
          Effect.gen(function*() {
            s.ctx.page.set(s.ctx.save, 99)
            const whilePending = s.ctx.page.get(s.ctx.optimisticValue)
            s.ctx.setStored(99)
            s.ctx.latch.openUnsafe()
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const afterConfirmation = s.ctx.page.get(s.ctx.optimisticValue)
            return { whilePending, afterConfirmation }
          })),
        Then('the change reported itself in flight, then settled on the stored value')((s) => {
          expect(
            Result.isSuccess(s.readings.whilePending) && s.readings.whilePending.waiting &&
              s.readings.whilePending.value === 99,
          ).toBe(true)
          expect(
            Result.isSuccess(s.readings.afterConfirmation) && s.readings.afterConfirmation.value === 99 &&
              !s.readings.afterConfirmation.waiting,
          ).toBe(true)
        }),
      ),
    )
  })
