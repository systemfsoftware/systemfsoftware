import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Deferred, Effect, Latch, Layer, Option, Schema, Stream, SubscriptionRef } from 'effect'
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

Feature('Turning a value on the page into a different value')
  .body(({ scenario }) => {
    scenario(
      'A value derived from another value stays in step even when written through the derived value',
      Gherkin.Do.pipe(
        Given('a page with a value and values derived from it in two ways')('ctx', () =>
          Effect.sync(() => {
            const base = Atom.make(10)
            const doubled = Atom.map(base, (n) => n * 2)
            const quadrupled = doubled.pipe(Atom.map((n) => n * 2))
            const page = Registry.make()
            return { page, base, doubled, quadrupled }
          })),
        When('the derived values are read, then the doubled one is written through')(
          'readings',
          (s) =>
            Effect.sync(() => {
              const beforeDouble = s.ctx.page.get(s.ctx.doubled)
              const beforeQuad = s.ctx.page.get(s.ctx.quadrupled)
              s.ctx.page.set(s.ctx.doubled, 100)
              const baseAfter = s.ctx.page.get(s.ctx.base)
              const afterDouble = s.ctx.page.get(s.ctx.doubled)
              const afterQuad = s.ctx.page.get(s.ctx.quadrupled)
              return { beforeDouble, beforeQuad, baseAfter, afterDouble, afterQuad }
            }),
        ),
        Then('both derived values tracked the write, and the source changed underneath')((s) => {
          expect(s.readings.beforeDouble).toBe(20)
          expect(s.readings.beforeQuad).toBe(40)
          expect(s.readings.baseAfter).toBe(100)
          expect(s.readings.afterDouble).toBe(200)
          expect(s.readings.afterQuad).toBe(400)
        }),
      ),
    )

    scenario(
      'A value derived from a value that loads shows the mapped outcome once it arrives',
      Gherkin.Do.pipe(
        Given('a page with a value that loads and two mappings of it')('ctx', () =>
          Effect.sync(() => {
            const count = Atom.fn((n: number) => Effect.succeed(n + 1))
            const mapped = count.pipe(Atom.mapResult((v) => v * 10))
            const mappedAgain = Atom.mapResult(mapped, (v) => v + 1)
            const page = Registry.make()
            return { page, count, mapped, mappedAgain }
          })),
        When('the mapped values are read before and after the source is asked to run')(
          'readings',
          (s) =>
            Effect.sync(() => {
              const before = s.ctx.page.get(s.ctx.mapped)
              s.ctx.page.set(s.ctx.count, 1)
              const after = s.ctx.page.get(s.ctx.mapped)
              const afterAgain = s.ctx.page.get(s.ctx.mappedAgain)
              return { before, after, afterAgain }
            }),
        ),
        Then('the mapped values stayed empty until the source ran, then showed the mapped outcomes')((s) => {
          expect(Result.isInitial(s.readings.before)).toBe(true)
          expect(Result.isSuccess(s.readings.after) && s.readings.after.value === 20).toBe(true)
          expect(Result.isSuccess(s.readings.afterAgain) && s.readings.afterAgain.value === 21).toBe(true)
        }),
      ),
    )
  })

Feature('Asking the page to compute a value on demand')
  .body(({ scenario }) => {
    scenario(
      'A value requested on demand stays empty until it is asked for, and a value with a stand-in starts filled in',
      Gherkin.Do.pipe(
        Given('a page with a plain on-demand value and one with a stand-in')('ctx', () =>
          Effect.sync(() => {
            const plain = Atom.fnSync<number>()((n) => n * 2)
            const withInitial = Atom.fnSync<number>()((n) => n + 1, { initialValue: 0 })
            const plainFn = Atom.fn<number>()((n) => Effect.succeed(n * 10))
            const withInitialFn = Atom.fn((n: number) => Effect.succeed(n + 1), { initialValue: 0 })
            const page = Registry.make()
            return { page, plain, withInitial, plainFn, withInitialFn }
          })),
        When('each value is read before and after being asked to run')('readings', (s) =>
          Effect.sync(() => {
            const plainBefore = s.ctx.page.get(s.ctx.plain)
            const withInitialBefore = s.ctx.page.get(s.ctx.withInitial)
            const plainFnBefore = s.ctx.page.get(s.ctx.plainFn)
            const withInitialFnBefore = s.ctx.page.get(s.ctx.withInitialFn)
            s.ctx.page.set(s.ctx.plain, 3)
            s.ctx.page.set(s.ctx.withInitial, 4)
            s.ctx.page.set(s.ctx.plainFn, 2)
            s.ctx.page.set(s.ctx.withInitialFn, 5)
            const plainAfter = s.ctx.page.get(s.ctx.plain)
            const withInitialAfter = s.ctx.page.get(s.ctx.withInitial)
            const plainFnAfter = s.ctx.page.get(s.ctx.plainFn)
            const withInitialFnAfter = s.ctx.page.get(s.ctx.withInitialFn)
            return {
              plainBefore,
              withInitialBefore,
              plainFnBefore,
              withInitialFnBefore,
              plainAfter,
              withInitialAfter,
              plainFnAfter,
              withInitialFnAfter,
            }
          })),
        Then('the plain values were empty until asked, and the ones with stand-ins started filled in')((s) => {
          expect(Option.isNone(s.readings.plainBefore)).toBe(true)
          expect(s.readings.withInitialBefore).toBe(0)
          expect(Result.isInitial(s.readings.plainFnBefore)).toBe(true)
          expect(Result.isSuccess(s.readings.withInitialFnBefore) && s.readings.withInitialFnBefore.value === 0).toBe(
            true,
          )
          expect(Option.isSome(s.readings.plainAfter) && s.readings.plainAfter.value === 6).toBe(true)
          expect(s.readings.withInitialAfter).toBe(5)
          expect(Result.isSuccess(s.readings.plainFnAfter) && s.readings.plainFnAfter.value === 20).toBe(true)
          expect(Result.isSuccess(s.readings.withInitialFnAfter) && s.readings.withInitialFnAfter.value === 6).toBe(
            true,
          )
        }),
      ),
    )
  })

Feature('Stopping and restarting a requested computation')
  .body(({ scenario }) => {
    scenario(
      'A computation that is interrupted can be reset and started again',
      Gherkin.Do.pipe(
        Given('a page with a computation that waits for the go-ahead')('ctx', () =>
          Effect.sync(() => {
            const latch = Latch.makeUnsafe()
            const task = Atom.fn(() => latch.await)
            const page = Registry.make()
            page.mount(task)
            return { page, task, latch }
          })),
        When('the computation is started, interrupted, reset, and started again')(
          'readings',
          (s) =>
            Effect.gen(function*() {
              const before = s.ctx.page.get(s.ctx.task)
              s.ctx.page.set(s.ctx.task, void 0)
              const running = s.ctx.page.get(s.ctx.task)
              s.ctx.page.set(s.ctx.task, Atom.Interrupt)
              const interrupted = s.ctx.page.get(s.ctx.task)
              s.ctx.page.set(s.ctx.task, Atom.Reset)
              const reset = s.ctx.page.get(s.ctx.task)
              s.ctx.page.set(s.ctx.task, void 0)
              const restarted = s.ctx.page.get(s.ctx.task)
              s.ctx.latch.openUnsafe()
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const finished = s.ctx.page.get(s.ctx.task)
              return { before, running, interrupted, reset, restarted, finished }
            }),
        ),
        Then('the computation reported empty, waiting, interrupted, empty again, waiting again, then done')((s) => {
          expect(Result.isInitial(s.readings.before)).toBe(true)
          expect(Result.isInitial(s.readings.running) && s.readings.running.waiting).toBe(true)
          expect(Result.isFailure(s.readings.interrupted)).toBe(true)
          expect(Result.isInitial(s.readings.reset)).toBe(true)
          expect(Result.isInitial(s.readings.restarted) && s.readings.restarted.waiting).toBe(true)
          expect(Result.isSuccess(s.readings.finished)).toBe(true)
        }),
      ),
    )

    scenario(
      'Several runs of a computation proceed side by side and all finish',
      Gherkin.Do.pipe(
        Given('a page with a computation that can run several times at once')('ctx', () =>
          Effect.sync(() => {
            const latches: Latch.Latch[] = []
            let done = 0
            const task = Atom.fn((_: number) => {
              const latch = Latch.makeUnsafe()
              latches.push(latch)
              return latch.await.pipe(Effect.tap(() => Effect.sync(() => done++)))
            }, { concurrent: true })
            const page = Registry.make()
            page.mount(task)
            return { page, task, latches: () => latches, done: () => done }
          })),
        When('the computation is asked to run three times before any of them finish')(
          'readings',
          (s) =>
            Effect.gen(function*() {
              const before = s.ctx.page.get(s.ctx.task)
              s.ctx.page.set(s.ctx.task, 1)
              s.ctx.page.set(s.ctx.task, 2)
              s.ctx.page.set(s.ctx.task, 3)
              const during = s.ctx.page.get(s.ctx.task)
              const started = s.ctx.latches().length
              const finishedBefore = s.ctx.done()
              s.ctx.latches().forEach((latch) => latch.openUnsafe())
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const finishedAfter = s.ctx.done()
              const after = s.ctx.page.get(s.ctx.task)
              return { before, during, started, finishedBefore, finishedAfter, after }
            }),
        ),
        Then('all three runs started and finished, and the value reflects the latest run')((s) => {
          expect(Result.isInitial(s.readings.before)).toBe(true)
          expect(Result.isInitial(s.readings.during) && s.readings.during.waiting).toBe(true)
          expect(s.readings.started).toBe(3)
          expect(s.readings.finishedBefore).toBe(0)
          expect(s.readings.finishedAfter).toBe(3)
          expect(Result.isSuccess(s.readings.after)).toBe(true)
        }),
      ),
    )
  })

Feature('Showing a stand-in value while a fetch is still running')
  .body(({ scenario }) => {
    scenario(
      'A value with a stand-in shows the stand-in until the fetch answers, then the real answer',
      Gherkin.Do.pipe(
        Given('a page with a value that fetches from a signal it cannot control yet')('ctx', () =>
          Effect.sync(() => {
            const gate = Deferred.makeUnsafe<number>()
            const value = Atom.make(Deferred.await(gate), { initialValue: 0 })
            const page = Registry.make()
            page.mount(value)
            return { gate, page, value }
          })),
        When('the value is read, the fetch answers, and the value is read again')(
          'readings',
          (s) =>
            Effect.gen(function*() {
              const before = s.ctx.page.get(s.ctx.value)
              yield* Deferred.succeed(s.ctx.gate, 1)
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const after = s.ctx.page.get(s.ctx.value)
              return { before, after }
            }),
        ),
        Then('the stand-in was shown while waiting, then the fetched answer replaced it')((s) => {
          expect(Result.isSuccess(s.readings.before) && s.readings.before.waiting && s.readings.before.value === 0)
            .toBe(true)
          expect(Result.isSuccess(s.readings.after) && !s.readings.after.waiting && s.readings.after.value === 1)
            .toBe(true)
        }),
      ),
    )
  })

Feature('Watching a value that arrives in pieces')
  .body(({ scenario }) => {
    scenario(
      'A value that streams its result fills in once the pieces arrive',
      Gherkin.Do.pipe(
        Given('a page with a value that streams its result when asked to run')('ctx', () =>
          Effect.sync(() => {
            const gate = Deferred.makeUnsafe<number>()
            const count = Atom.fn((start: number) => Stream.fromEffect(Deferred.await(gate).pipe(Effect.as(start + 1))))
            const page = Registry.make()
            page.mount(count)
            return { gate, page, count }
          })),
        When('the value is read, the computation is asked to run, and the signal arrives before it is read again')(
          'readings',
          (s) =>
            Effect.gen(function*() {
              const before = s.ctx.page.get(s.ctx.count)
              s.ctx.page.set(s.ctx.count, 1)
              const during = s.ctx.page.get(s.ctx.count)
              yield* Deferred.succeed(s.ctx.gate, 1)
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const after = s.ctx.page.get(s.ctx.count)
              return { before, during, after }
            }),
        ),
        Then('the value was empty, then waiting, then filled in with the streamed answer')((s) => {
          expect(Result.isInitial(s.readings.before)).toBe(true)
          expect(Result.isInitial(s.readings.during) && s.readings.during.waiting).toBe(true)
          expect(Result.isSuccess(s.readings.after) && !s.readings.after.waiting && s.readings.after.value === 2)
            .toBe(true)
        }),
      ),
    )

    scenario(
      'A streamed value shows its stand-in first, then the real answer, and keeps it across a refresh',
      Gherkin.Do.pipe(
        Given('a page with a streamed value that waits for a signal before emitting')('ctx', () =>
          Effect.sync(() => {
            const gate = Deferred.makeUnsafe<number>()
            const value = Atom.make(Stream.fromEffect(Deferred.await(gate)), { initialValue: 0 })
            const page = Registry.make()
            page.mount(value)
            return { gate, page, value }
          })),
        When('the value is read, the signal arrives, and the value is read again before and after a refresh')(
          'readings',
          (s) =>
            Effect.gen(function*() {
              const before = s.ctx.page.get(s.ctx.value)
              yield* Deferred.succeed(s.ctx.gate, 5)
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const loaded = s.ctx.page.get(s.ctx.value)
              s.ctx.page.refresh(s.ctx.value)
              const afterRefresh = s.ctx.page.get(s.ctx.value)
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const settled = s.ctx.page.get(s.ctx.value)
              return { before, loaded, afterRefresh, settled }
            }),
        ),
        Then('the stand-in showed first, the streamed answer arrived, the refresh kept it, and it settled')((s) => {
          expect(Result.isSuccess(s.readings.before) && s.readings.before.waiting && s.readings.before.value === 0)
            .toBe(true)
          expect(Result.isSuccess(s.readings.loaded) && s.readings.loaded.value === 5).toBe(true)
          expect(Result.isSuccess(s.readings.afterRefresh) && s.readings.afterRefresh.value === 5).toBe(true)
          expect(Result.isSuccess(s.readings.settled) && !s.readings.settled.waiting && s.readings.settled.value === 5)
            .toBe(true)
        }),
      ),
    )

    scenario(
      'A streamed value that runs dry, one that fails, and one read from a plain recipe all report their own fate',
      Gherkin.Do.pipe(
        Given('a page with a streamed value that runs dry, one that fails, and one from a plain recipe')(
          'ctx',
          () =>
            Effect.sync(() => {
              const empty = Atom.make(Stream.empty)
              const failing = Atom.make(Stream.fail('boom' as const))
              const streamed = Atom.make(() => Stream.succeed(7))
              const page = Registry.make()
              page.mount(empty)
              page.mount(failing)
              page.mount(streamed)
              return { page, empty, failing, streamed }
            }),
        ),
        When('all three are read after their streams have had a chance to finish')(
          'readings',
          (s) =>
            Effect.gen(function*() {
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const emptyResult = s.ctx.page.get(s.ctx.empty)
              const failingResult = s.ctx.page.get(s.ctx.failing)
              const streamedResult = s.ctx.page.get(s.ctx.streamed)
              return { emptyResult, failingResult, streamedResult }
            }),
        ),
        Then(
          'the dry stream reported nothing to show, the failing stream reported the failure, and the plain one filled in',
        )((
          s,
        ) => {
          expect(Result.isFailure(s.readings.emptyResult)).toBe(true)
          expect(Result.isFailure(s.readings.failingResult)).toBe(true)
          expect(Result.isSuccess(s.readings.streamedResult) && s.readings.streamedResult.value === 7).toBe(true)
        }),
      ),
    )
  })

Feature('Pulling a feed in batches')
  .body(({ scenario }) => {
    scenario(
      'A feed pulled in batches keeps only the newest batch when asked to',
      Gherkin.Do.pipe(
        Given('a page with a feed that arrives in two batches, keeping only the newest')(
          'ctx',
          () =>
            Effect.sync(() => {
              const feed = Atom.pull(Stream.make(1, 2).pipe(Stream.concat(Stream.make(3, 4))), {
                disableAccumulation: true,
              })
              const page = Registry.make()
              page.mount(feed)
              return { page, feed }
            }),
        ),
        When('the feed is pulled twice')('result', (s) =>
          Effect.gen(function*() {
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            s.ctx.page.set(s.ctx.feed, void 0)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            return s.ctx.page.get(s.ctx.feed)
          })),
        Then('the second batch replaced the first instead of joining it')((s) => {
          expect(Result.isSuccess(s.result)).toBe(true)
          if (Result.isSuccess(s.result)) {
            expect(s.result.value.done).toBe(false)
            expect([...s.result.value.items]).toEqual([3, 4])
          }
        }),
      ),
    )

    scenario(
      'A feed that runs dry reports that it had nothing more to show',
      Gherkin.Do.pipe(
        Given('a page with a feed that is empty')('ctx', () =>
          Effect.sync(() => {
            const feed = Atom.pull(Stream.empty)
            const page = Registry.make()
            page.mount(feed)
            return { page, feed }
          })),
        When('the feed is read after its batch has had a chance to arrive')('result', (s) =>
          Effect.gen(function*() {
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            return s.ctx.page.get(s.ctx.feed)
          })),
        Then('the feed reports that there was nothing to show')((s) => {
          expect(Result.isFailure(s.result)).toBe(true)
        }),
      ),
    )

    scenario(
      'A feed that fails reports the failure',
      Gherkin.Do.pipe(
        Given('a page with a feed that fails')('ctx', () =>
          Effect.sync(() => {
            const feed = Atom.pull(Stream.fail('boom' as const))
            const page = Registry.make()
            page.mount(feed)
            return { page, feed }
          })),
        When('the feed is read after its batch has had a chance to arrive')('result', (s) =>
          Effect.gen(function*() {
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            return s.ctx.page.get(s.ctx.feed)
          })),
        Then('the feed reports the failure')((s) => {
          expect(Result.isFailure(s.result)).toBe(true)
        }),
      ),
    )

    scenario(
      'Two requests for the next batch at the same time both arrive once the signal comes',
      Gherkin.Do.pipe(
        Given('a page with a feed whose batches wait for a signal before arriving')('ctx', () =>
          Effect.sync(() => {
            const gate = Deferred.makeUnsafe<number>()
            const feed = Atom.pull(() => Stream.fromEffectRepeat(Deferred.await(gate).pipe(Effect.as(7))))
            const page = Registry.make()
            page.mount(feed)
            return { gate, page, feed }
          })),
        When('the feed is asked for two batches at once, then the signal arrives')(
          'result',
          (s) =>
            Effect.gen(function*() {
              s.ctx.page.set(s.ctx.feed, void 0)
              s.ctx.page.set(s.ctx.feed, void 0)
              yield* Deferred.succeed(s.ctx.gate, 7)
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              return s.ctx.page.get(s.ctx.feed)
            }),
        ),
        Then('every batch that was asked for arrived once the signal came')((s) => {
          expect(Result.isSuccess(s.result)).toBe(true)
          if (Result.isSuccess(s.result)) {
            expect(s.result.value.done).toBe(false)
            expect([...s.result.value.items]).toEqual([7, 7, 7])
          }
        }),
      ),
    )
  })

Feature('Keeping a live view of a shared reference')
  .body(({ scenario }) => {
    scenario(
      'A live view of a shared reference follows the reference both ways, and a view whose reference cannot start reports it',
      Gherkin.Do.pipe(
        Given('a page with several live views of shared references')('ctx', () =>
          Effect.gen(function*() {
            const ref = yield* SubscriptionRef.make(0)
            const view = Atom.subscriptionRef(ref)
            const effectView = Atom.subscriptionRef(SubscriptionRef.make(0))
            const functionView = Atom.subscriptionRef((_get) => SubscriptionRef.make(0))
            const brokenView = Atom.subscriptionRef(Effect.fail('nope' as const))
            const page = Registry.make()
            page.mount(view)
            page.mount(effectView)
            page.mount(functionView)
            page.mount(brokenView)
            return { ref, page, view, effectView, functionView, brokenView }
          })),
        When('the views are read, written through, and the underlying reference changes')(
          'readings',
          (s) =>
            Effect.gen(function*() {
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const viewBefore = s.ctx.page.get(s.ctx.view)
              const effectBefore = s.ctx.page.get(s.ctx.effectView)
              const functionBefore = s.ctx.page.get(s.ctx.functionView)
              const brokenBefore = s.ctx.page.get(s.ctx.brokenView)
              s.ctx.page.set(s.ctx.view, 5)
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const viewWritten = s.ctx.page.get(s.ctx.view)
              s.ctx.page.set(s.ctx.effectView, 3)
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const effectWritten = s.ctx.page.get(s.ctx.effectView)
              yield* SubscriptionRef.set(s.ctx.ref, 9)
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const viewChanged = s.ctx.page.get(s.ctx.view)
              return { viewBefore, effectBefore, functionBefore, brokenBefore, viewWritten, effectWritten, viewChanged }
            }),
        ),
        Then(
          'every view tracked its reference, writes reached the references, and the broken view reported its problem',
        )((
          s,
        ) => {
          expect(s.readings.viewBefore).toBe(0)
          expect(Result.isSuccess(s.readings.effectBefore) && s.readings.effectBefore.value === 0).toBe(true)
          expect(Result.isSuccess(s.readings.functionBefore) && s.readings.functionBefore.value === 0).toBe(true)
          expect(Result.isFailure(s.readings.brokenBefore)).toBe(true)
          expect(s.readings.viewWritten).toBe(5)
          expect(Result.isSuccess(s.readings.effectWritten) && s.readings.effectWritten.value === 3).toBe(true)
          expect(s.readings.viewChanged).toBe(9)
        }),
      ),
    )
  })

Feature('A page that needs services to answer')
  .body(({ scenario }) => {
    scenario(
      'A page with services computes values and runs tasks against those services',
      Gherkin.Do.pipe(
        Given('a page with services that supply a starting number')('ctx', () =>
          Effect.sync(() => {
            const Counter = Context.Service<number>('Atom.feature.test/Counter')
            const counterRuntime = Atom.context()(Layer.sync(Counter, () => 1))
            const count = counterRuntime.atom(Counter.use((n) => Effect.succeed(n)))
            const doubled = counterRuntime.atom((_get) => Counter.use((n) => Effect.succeed(n * 2)))
            const add = counterRuntime.fn((n: number) => Counter.use((c) => Effect.succeed(c + n)))
            const curried = counterRuntime.fn<number>()((n) => Counter.use((c) => Effect.succeed(c + n * 10)))
            const reactive = counterRuntime.fn((n: number) => Counter.use((c) => Effect.succeed(c + n)), {
              reactivityKeys: ['count'],
            })
            const reactiveStream = counterRuntime.fn((n: number) => Stream.succeed(n), {
              reactivityKeys: ['count'],
            })
            const feed = counterRuntime.pull(Stream.make(1))
            const streamed = counterRuntime.atom(Stream.succeed(1))
            const refView = counterRuntime.subscriptionRef(SubscriptionRef.make(0))
            const refFromFunction = counterRuntime.subscriptionRef(() => SubscriptionRef.make(0))
            const page = Registry.make()
            return {
              page,
              count,
              doubled,
              add,
              curried,
              reactive,
              reactiveStream,
              feed,
              streamed,
              refView,
              refFromFunction,
            }
          })),
        When('the values are read and the tasks are asked to run')('readings', (s) =>
          Effect.gen(function*() {
            const countResult = s.ctx.page.get(s.ctx.count)
            const doubledResult = s.ctx.page.get(s.ctx.doubled)
            s.ctx.page.set(s.ctx.add, 4)
            const addResult = s.ctx.page.get(s.ctx.add)
            s.ctx.page.set(s.ctx.curried, 2)
            const curriedResult = s.ctx.page.get(s.ctx.curried)
            s.ctx.page.set(s.ctx.reactive, 4)
            const reactiveResult = s.ctx.page.get(s.ctx.reactive)
            s.ctx.page.set(s.ctx.reactiveStream, 3)
            const reactiveStreamResult = s.ctx.page.get(s.ctx.reactiveStream)
            s.ctx.page.mount(s.ctx.feed)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            s.ctx.page.set(s.ctx.feed, void 0)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const feedResult = s.ctx.page.get(s.ctx.feed)
            s.ctx.page.mount(s.ctx.streamed)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const streamedResult = s.ctx.page.get(s.ctx.streamed)
            s.ctx.page.mount(s.ctx.refView)
            s.ctx.page.mount(s.ctx.refFromFunction)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const refResult = s.ctx.page.get(s.ctx.refView)
            const refFunctionResult = s.ctx.page.get(s.ctx.refFromFunction)
            return {
              countResult,
              doubledResult,
              addResult,
              curriedResult,
              reactiveResult,
              reactiveStreamResult,
              feedResult,
              streamedResult,
              refResult,
              refFunctionResult,
            }
          })),
        Then('every value came from the services and every task ran against them')((s) => {
          expect(Result.isSuccess(s.readings.countResult) && s.readings.countResult.value === 1).toBe(true)
          expect(Result.isSuccess(s.readings.doubledResult) && s.readings.doubledResult.value === 2).toBe(true)
          expect(Result.isSuccess(s.readings.addResult) && s.readings.addResult.value === 5).toBe(true)
          expect(Result.isSuccess(s.readings.curriedResult) && s.readings.curriedResult.value === 21).toBe(true)
          expect(Result.isSuccess(s.readings.reactiveResult) && s.readings.reactiveResult.value === 5).toBe(true)
          expect(
            Result.isSuccess(s.readings.reactiveStreamResult) && s.readings.reactiveStreamResult.value === 3,
          ).toBe(true)
          expect(Result.isSuccess(s.readings.feedResult) && s.readings.feedResult.value.done).toBe(true)
          expect(Result.isSuccess(s.readings.streamedResult) && s.readings.streamedResult.value === 1).toBe(true)
          expect(Result.isSuccess(s.readings.refResult) && s.readings.refResult.value === 0).toBe(true)
          expect(Result.isSuccess(s.readings.refFunctionResult) && s.readings.refFunctionResult.value === 0).toBe(true)
        }),
      ),
    )

    scenario(
      'A page whose services are built from a recipe answers with the recipe result',
      Gherkin.Do.pipe(
        Given('a page whose services are built from a recipe that reads the page first')(
          'ctx',
          () =>
            Effect.sync(() => {
              const Counter = Context.Service<number>('Atom.feature.test/CounterFromRecipe')
              const recipeRuntime = Atom.context()((_get) => Layer.sync(Counter, () => 7))
              const count = recipeRuntime.atom(Counter.use((n) => Effect.succeed(n)))
              const page = Registry.make()
              return { page, count }
            }),
        ),
        When('the value is read')('reading', (s) => Effect.sync(() => s.ctx.page.get(s.ctx.count))),
        Then('it reflects the number the recipe provided')((s) => {
          expect(Result.isSuccess(s.reading) && s.reading.value === 7).toBe(true)
        }),
      ),
    )

    scenario(
      'A page whose services fail reports that every value is unavailable',
      Gherkin.Do.pipe(
        Given('a page whose services fail to start')('ctx', () =>
          Effect.sync(() => {
            const brokenRuntime = Atom.context()(Layer.effectDiscard(Effect.fail('boom' as const)))
            const count = brokenRuntime.atom(Effect.succeed(1))
            const add = brokenRuntime.fn((n: number) => Effect.succeed(n))
            const feed = brokenRuntime.pull(Stream.make(1))
            const refView = brokenRuntime.subscriptionRef(SubscriptionRef.make(0))
            const page = Registry.make()
            return { page, count, add, feed, refView }
          })),
        When('every value is read')('readings', (s) =>
          Effect.sync(() => ({
            count: s.ctx.page.get(s.ctx.count),
            add: s.ctx.page.get(s.ctx.add),
            feed: s.ctx.page.get(s.ctx.feed),
            refView: s.ctx.page.get(s.ctx.refView),
          }))),
        Then('every value reports the failure')((s) => {
          expect(Result.isFailure(s.readings.count)).toBe(true)
          expect(Result.isFailure(s.readings.add)).toBe(true)
          expect(Result.isFailure(s.readings.feed)).toBe(true)
          expect(Result.isFailure(s.readings.refView)).toBe(true)
        }),
      ),
    )
  })

Feature('Saving a value so a reloaded page can restore it')
  .body(({ scenario }) => {
    scenario(
      'A saved value starts a fresh page already filled in',
      Gherkin.Do.pipe(
        Given('a saved value and a fresh page seeded with it')('ctx', () =>
          Effect.sync(() => {
            const count = Atom.make(0).pipe(Atom.serializable({ key: 'count', schema: Schema.Number }))
            const page = Registry.make({ initialValues: [Atom.initialValue(count, 10)] })
            return { page, count }
          })),
        When('the value is read and changed')('readings', (s) =>
          Effect.sync(() => {
            const seeded = s.ctx.page.get(s.ctx.count)
            s.ctx.page.set(s.ctx.count, 5)
            const afterChange = s.ctx.page.get(s.ctx.count)
            return { seeded, afterChange }
          })),
        Then('the page started with the saved value and kept the change')((s) => {
          expect(s.readings.seeded).toBe(10)
          expect(s.readings.afterChange).toBe(5)
        }),
      ),
    )

    scenario(
      'A saved value arriving while the page already shows the value updates it in place',
      Gherkin.Do.pipe(
        Given('a page already showing a saved value')('ctx', () =>
          Effect.sync(() => {
            const count = Atom.make(0).pipe(Atom.serializable({ key: 'count', schema: Schema.Number }))
            const page = Registry.make()
            return { page, count }
          })),
        When('the value is shown, then the saved copy arrives')('readings', (s) =>
          Effect.sync(() => {
            const before = s.ctx.page.get(s.ctx.count)
            s.ctx.page.setSerializable('count', 42)
            const after = s.ctx.page.get(s.ctx.count)
            return { before, after }
          })),
        Then('the value on the page was replaced by the saved copy')((s) => {
          expect(s.readings.before).toBe(0)
          expect(s.readings.after).toBe(42)
        }),
      ),
    )

    scenario(
      'A saved value arriving before the page asks for it is applied when it does',
      Gherkin.Do.pipe(
        Given('a saved value arriving before the page is asked about it')('ctx', () =>
          Effect.sync(() => {
            const count = Atom.make(0).pipe(Atom.serializable({ key: 'count', schema: Schema.Number }))
            const page = Registry.make()
            page.setSerializable('count', 42)
            return { page, count }
          })),
        When('the value is read')('reading', (s) => Effect.sync(() => s.ctx.page.get(s.ctx.count))),
        Then('it shows the saved value')((s) => {
          expect(s.reading).toBe(42)
        }),
      ),
    )

    scenario(
      'A saved derived value restores the value it was derived from, until the derived value refreshes',
      Gherkin.Do.pipe(
        Given('a page with a derived value that refreshes on its own schedule, saved under a key')(
          'ctx',
          () =>
            Effect.sync(() => {
              vi.useFakeTimers()
              const base = Atom.make(0)
              const derived = base.pipe(Atom.withRefresh(1000))
              const saved = derived.pipe(Atom.serializable({ key: 'derived', schema: Schema.Number }))
              const page = Registry.make()
              const unmount = page.mount(saved)
              return { page, saved, unmount }
            }),
        ),
        When('the saved copy arrives, the value is read, then its refresh schedule runs out and it is read again')(
          'readings',
          (s) =>
            Effect.sync(() => {
              s.ctx.page.setSerializable('derived', 99)
              const restored = s.ctx.page.get(s.ctx.saved)
              vi.advanceTimersByTime(2000)
              const afterRefresh = s.ctx.page.get(s.ctx.saved)
              s.ctx.unmount()
              vi.useRealTimers()
              return { restored, afterRefresh }
            }),
        ),
        Then('the derived value was restored from the saved copy, then returned to its own schedule')((s) => {
          expect(s.readings.restored).toBe(99)
          expect(s.readings.afterRefresh).toBe(0)
        }),
      ),
    )

    scenario(
      'A saved value keeps its own name when given one',
      Gherkin.Do.pipe(
        Given('a saved value that was given a name before being saved')('ctx', () =>
          Effect.sync(() => {
            const named = Atom.make(0).pipe(
              Atom.withLabel('my-count'),
              Atom.serializable({ key: 'named', schema: Schema.Number }),
            )
            const page = Registry.make()
            page.mount(named)
            return { page, named }
          })),
        When('the value is read and its name is asked for')('readings', (s) =>
          Effect.sync(() => ({
            value: s.ctx.page.get(s.ctx.named),
            name: s.ctx.named.label?.[0],
          }))),
        Then('the value works normally and keeps the name it was given')((s) => {
          expect(s.readings.value).toBe(0)
          expect(s.readings.name).toBe('my-count')
        }),
      ),
    )
  })

Feature('Serving a value to the server')
  .body(({ scenario }) => {
    scenario(
      'A page serves its values to the server, using each value\u2019s own server recipe',
      Gherkin.Do.pipe(
        Given('a page with plain, overridden, and nested values')('ctx', () =>
          Effect.sync(() => {
            const local = Atom.make(0)
            const overridden = Atom.make(1).pipe(Atom.withServerValue(() => 7))
            const nested = Atom.make((get) => get(local) * 2).pipe(Atom.withServerValue((get) => get(local) * 3))
            const notYetLoaded = Atom.make(Effect.succeed(3)).pipe(Atom.withServerValueInitial)
            const page = Registry.make()
            return { page, local, overridden, nested, notYetLoaded }
          })),
        When('the local value is changed and every value is read for the server')('readings', (s) =>
          Effect.sync(() => {
            s.ctx.page.set(s.ctx.local, 5)
            const plain = Atom.getServerValue(s.ctx.local, s.ctx.page)
            const overriddenValue = Atom.getServerValue(s.ctx.overridden, s.ctx.page)
            const nestedValue = Atom.getServerValue(s.ctx.nested, s.ctx.page)
            const notYetLoadedValue = Atom.getServerValue(s.ctx.notYetLoaded, s.ctx.page)
            return { plain, overriddenValue, nestedValue, notYetLoadedValue }
          })),
        Then('each value followed its own server recipe')((s) => {
          expect(s.readings.plain).toBe(5)
          expect(s.readings.overriddenValue).toBe(7)
          expect(s.readings.nestedValue).toBe(15)
          expect(Result.isInitial(s.readings.notYetLoadedValue) && s.readings.notYetLoadedValue.waiting).toBe(true)
        }),
      ),
    )
  })

Feature('Falling back to a stored copy while a value loads')
  .body(({ scenario }) => {
    scenario(
      'A writable value with a stored copy shows the copy until it runs, and writes go through to it',
      Gherkin.Do.pipe(
        Given('a page with a writable value and a stored copy to fall back on')('ctx', () =>
          Effect.sync(() => {
            const fallback = Atom.make(Result.success('cached' as const))
            const source = Atom.fn((n: number) => Effect.succeed(String(n)))
            const withStandIn = source.pipe(Atom.withFallback(fallback))
            const mappedSource = source.pipe(Atom.mapResult((v) => `${v}!`))
            const mappedWithStandIn = mappedSource.pipe(Atom.withFallback(fallback))
            const page = Registry.make()
            return { page, withStandIn, mappedWithStandIn }
          })),
        When('the values are read, written through, and read again')('readings', (s) =>
          Effect.sync(() => {
            const before = s.ctx.page.get(s.ctx.withStandIn)
            const mappedBefore = s.ctx.page.get(s.ctx.mappedWithStandIn)
            s.ctx.page.set(s.ctx.withStandIn, 1)
            const after = s.ctx.page.get(s.ctx.withStandIn)
            s.ctx.page.set(s.ctx.mappedWithStandIn, 2)
            const mappedAfter = s.ctx.page.get(s.ctx.mappedWithStandIn)
            return { before, after, mappedBefore, mappedAfter }
          })),
        Then('the stored copy showed until the value ran, then the real outcome replaced it')((s) => {
          expect(
            Result.isSuccess(s.readings.before) && s.readings.before.waiting && s.readings.before.value === 'cached',
          )
            .toBe(true)
          expect(Result.isSuccess(s.readings.after) && !s.readings.after.waiting && s.readings.after.value === '1')
            .toBe(true)
          expect(
            Result.isSuccess(s.readings.mappedBefore) && s.readings.mappedBefore.waiting &&
              s.readings.mappedBefore.value === 'cached',
          ).toBe(true)
          expect(
            Result.isSuccess(s.readings.mappedAfter) && !s.readings.mappedAfter.waiting &&
              s.readings.mappedAfter.value === '2!',
          ).toBe(true)
        }),
      ),
    )
  })

Feature('Refreshing a value when the page regains attention')
  .body(({ scenario }) => {
    scenario(
      'A value past its fresh time refreshes when the page regains attention, and one set to always refresh does too',
      Gherkin.Do.pipe(
        Given('a page with two values that refresh on attention, one only when stale')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            let stored = 1
            const source = Atom.make(Effect.sync(() => stored))
            const focus = Atom.make(0)
            const onFocus = source.pipe(Atom.swr({ staleTime: 100, revalidateOnFocus: true, focusSignal: focus }))
            const alwaysOnFocus = source.pipe(
              Atom.swr({ staleTime: 100, revalidateOnFocus: 'always', focusSignal: focus }),
            )
            const page = Registry.make()
            return {
              page,
              onFocus,
              alwaysOnFocus,
              focus,
              setStored: (n: number) => {
                stored = n
              },
            }
          })),
        When('the values are read, they go stale, the store changes, and the page regains attention')(
          'readings',
          (s) =>
            Effect.sync(() => {
              const first = s.ctx.page.get(s.ctx.onFocus)
              const firstAlways = s.ctx.page.get(s.ctx.alwaysOnFocus)
              s.ctx.setStored(2)
              vi.advanceTimersByTime(200)
              s.ctx.page.set(s.ctx.focus, 1)
              const revalidated = s.ctx.page.get(s.ctx.onFocus)
              const revalidatedAlways = s.ctx.page.get(s.ctx.alwaysOnFocus)
              vi.useRealTimers()
              return { first, firstAlways, revalidated, revalidatedAlways }
            }),
        ),
        Then('both values refreshed to the new store value when attention returned')((s) => {
          expect(Result.isSuccess(s.readings.first) && s.readings.first.value === 1).toBe(true)
          expect(Result.isSuccess(s.readings.firstAlways) && s.readings.firstAlways.value === 1).toBe(true)
          expect(Result.isSuccess(s.readings.revalidated) && s.readings.revalidated.value === 2).toBe(true)
          expect(Result.isSuccess(s.readings.revalidatedAlways) && s.readings.revalidatedAlways.value === 2).toBe(true)
        }),
      ),
    )

    scenario(
      'A value that is already stale when first shown is not fetched again until something asks for it',
      Gherkin.Do.pipe(
        Given('a page with a value that should not fetch again on first sight')('ctx', () =>
          Effect.sync(() => {
            let reads = 0
            const source = Atom.make(Effect.sync(() => {
              reads++
              return 1
            }))
            const quiet = source.pipe(Atom.swr({ staleTime: 0, revalidateOnMount: false }))
            const page = Registry.make()
            return { page, quiet, reads: () => reads }
          })),
        When('the value is read, then asked to refresh, and read again')('readings', (s) =>
          Effect.sync(() => {
            const first = s.ctx.page.get(s.ctx.quiet)
            const readsAfterFirst = s.ctx.reads()
            s.ctx.page.refresh(s.ctx.quiet)
            const second = s.ctx.page.get(s.ctx.quiet)
            const readsAfterSecond = s.ctx.reads()
            return { first, readsAfterFirst, second, readsAfterSecond }
          })),
        Then('the first sight did not fetch again, and only the later refresh did')((s) => {
          expect(Result.isSuccess(s.readings.first) && s.readings.first.value === 1).toBe(true)
          expect(s.readings.readsAfterFirst).toBe(1)
          expect(Result.isSuccess(s.readings.second) && s.readings.second.value === 1).toBe(true)
          expect(s.readings.readsAfterSecond).toBeGreaterThan(1)
        }),
      ),
    )

    scenario(
      'A value that failed and one that is still waiting are left alone',
      Gherkin.Do.pipe(
        Given('a page with a value that failed and one that is still waiting')('ctx', () =>
          Effect.sync(() => {
            const failing = Atom.make(Effect.fail('down' as const)).pipe(Atom.swr({ staleTime: 100 }))
            const waiting = Atom.make(() => Result.success(1, { waiting: true })).pipe(Atom.swr({ staleTime: 100 }))
            const page = Registry.make()
            return { page, failing, waiting }
          })),
        When('both values are read')('readings', (s) =>
          Effect.sync(() => ({
            failing: s.ctx.page.get(s.ctx.failing),
            waiting: s.ctx.page.get(s.ctx.waiting),
          }))),
        Then('the failed value reports its failure and the waiting value stays waiting')((s) => {
          expect(Result.isFailure(s.readings.failing)).toBe(true)
          expect(Result.isSuccess(s.readings.waiting) && s.readings.waiting.waiting && s.readings.waiting.value === 1)
            .toBe(true)
        }),
      ),
    )
  })

Feature('Confirming a change through a working copy')
  .body(({ scenario }) => {
    scenario(
      'A change confirmed through a working copy reports its progress and then the confirmed value',
      Gherkin.Do.pipe(
        Given('a page with two working copies that report progress as they confirm')('ctx', () =>
          Effect.sync(() => {
            const latch = Latch.makeUnsafe()
            let stored = 1
            const source = Atom.make(() => stored)
            const optimisticValue = source.pipe(Atom.optimistic)
            const save = optimisticValue.pipe(
              Atom.optimisticFn({
                reducer: (_current, update: number) => update,
                fn: (set) =>
                  Atom.fn(Effect.fnUntraced(function*(n: number) {
                    set(n * 10)
                    yield* latch.await
                    return n
                  })),
              }),
              Atom.keepAlive,
            )
            const latch2 = Latch.makeUnsafe()
            let stored2 = 1
            const source2 = Atom.make(Effect.sync(() => stored2))
            const optimistic2 = source2.pipe(Atom.optimistic)
            const save2 = optimistic2.pipe(
              Atom.optimisticFn({
                reducer: (_current, update: number) => Result.success(update, { waiting: true }),
                fn: (set) =>
                  Atom.fn(Effect.fnUntraced(function*(n: number) {
                    set(Result.success(n * 10, { waiting: true }))
                    yield* latch2.await
                    return n
                  })),
              }),
              Atom.keepAlive,
            )
            const page = Registry.make()
            return {
              page,
              optimisticValue,
              save,
              latch,
              setStored: (n: number) => {
                stored = n
              },
              optimistic2,
              save2,
              latch2,
              setStored2: (n: number) => {
                stored2 = n
              },
            }
          })),
        When('both changes are made, confirmed, and read throughout')('readings', (s) =>
          Effect.gen(function*() {
            const before = s.ctx.page.get(s.ctx.optimisticValue)
            s.ctx.page.set(s.ctx.save, 99)
            const whilePending = s.ctx.page.get(s.ctx.optimisticValue)
            s.ctx.page.set(s.ctx.save, 99)
            s.ctx.setStored(99)
            s.ctx.latch.openUnsafe()
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const afterConfirmation = s.ctx.page.get(s.ctx.optimisticValue)
            const before2 = s.ctx.page.get(s.ctx.optimistic2)
            s.ctx.page.set(s.ctx.save2, 99)
            const whilePending2 = s.ctx.page.get(s.ctx.optimistic2)
            s.ctx.setStored2(99)
            s.ctx.latch2.openUnsafe()
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const afterConfirmation2 = s.ctx.page.get(s.ctx.optimistic2)
            return { before, whilePending, afterConfirmation, before2, whilePending2, afterConfirmation2 }
          })),
        Then('each change showed its progress, then settled on the confirmed value')((s) => {
          expect(s.readings.before).toBe(1)
          expect(s.readings.whilePending).toBe(990)
          expect(s.readings.afterConfirmation).toBe(99)
          expect(Result.isSuccess(s.readings.before2) && s.readings.before2.value === 1).toBe(true)
          expect(
            Result.isSuccess(s.readings.whilePending2) && s.readings.whilePending2.waiting &&
              s.readings.whilePending2.value === 990,
          ).toBe(true)
          expect(
            Result.isSuccess(s.readings.afterConfirmation2) && !s.readings.afterConfirmation2.waiting &&
              s.readings.afterConfirmation2.value === 99,
          ).toBe(true)
        }),
      ),
    )

    scenario(
      'A change that is accepted right away settles on the confirmed value without waiting',
      Gherkin.Do.pipe(
        Given('a page with a working copy whose confirmation is immediate')('ctx', () =>
          Effect.sync(() => {
            let stored = 1
            const source = Atom.make(() => stored)
            const optimisticValue = source.pipe(Atom.optimistic)
            const save = optimisticValue.pipe(
              Atom.optimisticFn({
                reducer: (_current, update: number) => update,
                fn: Atom.fn((n: number) => Effect.succeed(n)),
              }),
              Atom.keepAlive,
            )
            const page = Registry.make()
            return {
              page,
              optimisticValue,
              save,
              setStored: (n: number) => {
                stored = n
              },
            }
          })),
        When('the change is made and the store accepts it right away')('readings', (s) =>
          Effect.gen(function*() {
            s.ctx.page.set(s.ctx.save, 99)
            s.ctx.setStored(99)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const afterConfirmation = s.ctx.page.get(s.ctx.optimisticValue)
            return { afterConfirmation }
          })),
        Then('the confirmed value settled on screen right away')((s) => {
          expect(s.readings.afterConfirmation).toBe(99)
        }),
      ),
    )
  })

Feature('Remembering values in a slower store')
  .body(({ scenario }) => {
    scenario(
      'A value remembered in a slower store shows the fallback until the store answers, without overwriting the store',
      Gherkin.Do.pipe(
        Given('a page remembering a value in a store that answers only after a signal')('ctx', () =>
          Effect.sync(() => {
            const storage = new Map<string, string>()
            storage.set('known-key', JSON.stringify(42))
            const gate = Deferred.makeUnsafe<void>()
            const DelayedKVS = Layer.succeed(
              KeyValueStore.KeyValueStore,
              KeyValueStore.makeStringOnly({
                get: (key) => Deferred.await(gate).pipe(Effect.as(storage.get(key))),
                set: (key, value) =>
                  Effect.sync(() => {
                    storage.set(key, value)
                  }),
                remove: (key) =>
                  Effect.sync(() => {
                    storage.delete(key)
                  }),
                clear: Effect.sync(() => storage.clear()),
                size: Effect.sync(() => storage.size),
              }),
            )
            const kvsRuntime = Atom.context()(DelayedKVS)
            const remembered = Atom.kvs({
              runtime: kvsRuntime,
              key: 'known-key',
              schema: Schema.Number,
              defaultValue: () => 0,
            })
            const page = Registry.make()
            page.mount(remembered)
            return { gate, page, remembered, storage }
          })),
        When('the value is read, the store answers, and the value is read again')(
          'readings',
          (s) =>
            Effect.gen(function*() {
              const whileLoading = s.ctx.page.get(s.ctx.remembered)
              yield* Deferred.succeed(s.ctx.gate, void 0)
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const loaded = s.ctx.page.get(s.ctx.remembered)
              const stored = s.ctx.storage.get('known-key')
              return { whileLoading, loaded, stored }
            }),
        ),
        Then('the fallback showed while loading, then the stored value appeared and the store was untouched')((s) => {
          expect(s.readings.whileLoading).toBe(0)
          expect(s.readings.loaded).toBe(42)
          expect(s.readings.stored).toBe(JSON.stringify(42))
        }),
      ),
    )

    scenario(
      'A write made before the store answers wins over the slower store read',
      Gherkin.Do.pipe(
        Given('a page remembering a value in a store that answers only after a signal')('ctx', () =>
          Effect.sync(() => {
            const storage = new Map<string, string>()
            storage.set('known-key', JSON.stringify(42))
            const gate = Deferred.makeUnsafe<void>()
            const DelayedKVS = Layer.succeed(
              KeyValueStore.KeyValueStore,
              KeyValueStore.makeStringOnly({
                get: (key) =>
                  Effect.sync(() => storage.get(key)).pipe(
                    Effect.flatMap((stale) => Deferred.await(gate).pipe(Effect.as(stale))),
                  ),
                set: (key, value) =>
                  Effect.sync(() => {
                    storage.set(key, value)
                  }),
                remove: (key) =>
                  Effect.sync(() => {
                    storage.delete(key)
                  }),
                clear: Effect.sync(() => storage.clear()),
                size: Effect.sync(() => storage.size),
              }),
            )
            const kvsRuntime = Atom.context()(DelayedKVS)
            const remembered = Atom.kvs({
              runtime: kvsRuntime,
              key: 'known-key',
              schema: Schema.Number,
              defaultValue: () => 0,
            })
            const page = Registry.make()
            page.mount(remembered)
            return { gate, page, remembered }
          })),
        When('a write is made, then the store answers')('value', (s) =>
          Effect.gen(function*() {
            s.ctx.page.set(s.ctx.remembered, 99)
            yield* Deferred.succeed(s.ctx.gate, void 0)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            return s.ctx.page.get(s.ctx.remembered)
          })),
        Then('the written value wins over the slower store read')((s) => {
          expect(s.value).toBe(99)
        }),
      ),
    )

    scenario(
      'A value remembered in loading mode exposes its loading state and accepts writes',
      Gherkin.Do.pipe(
        Given('a page remembering a missing value in a store that answers only after a signal')(
          'ctx',
          () =>
            Effect.sync(() => {
              const storage = new Map<string, string>()
              const gate = Deferred.makeUnsafe<void>()
              const DelayedKVS = Layer.succeed(
                KeyValueStore.KeyValueStore,
                KeyValueStore.makeStringOnly({
                  get: (key) => Deferred.await(gate).pipe(Effect.as(storage.get(key))),
                  set: (key, value) =>
                    Effect.sync(() => {
                      storage.set(key, value)
                    }),
                  remove: (key) =>
                    Effect.sync(() => {
                      storage.delete(key)
                    }),
                  clear: Effect.sync(() => storage.clear()),
                  size: Effect.sync(() => storage.size),
                }),
              )
              const kvsRuntime = Atom.context()(DelayedKVS)
              const remembered = Atom.kvs({
                mode: 'async',
                runtime: kvsRuntime,
                key: 'fresh-key',
                schema: Schema.Number,
                defaultValue: () => 0,
              })
              const page = Registry.make()
              page.mount(remembered)
              return { gate, page, remembered, storage }
            }),
        ),
        When('the value is read, the store answers, the value is written, and it is read again')(
          'readings',
          (s) =>
            Effect.gen(function*() {
              const whileLoading = s.ctx.page.get(s.ctx.remembered)
              yield* Deferred.succeed(s.ctx.gate, void 0)
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const loaded = s.ctx.page.get(s.ctx.remembered)
              s.ctx.page.set(s.ctx.remembered, 99)
              const afterWrite = s.ctx.page.get(s.ctx.remembered)
              const stored = s.ctx.storage.get('fresh-key')
              return { whileLoading, loaded, afterWrite, stored }
            }),
        ),
        Then('the value reported loading, filled in the fallback, accepted the write, and wrote it through')((s) => {
          expect(Result.isInitial(s.readings.whileLoading)).toBe(true)
          expect(Result.isSuccess(s.readings.loaded) && s.readings.loaded.value === 0).toBe(true)
          expect(Result.isSuccess(s.readings.afterWrite) && s.readings.afterWrite.value === 99).toBe(true)
          expect(s.readings.stored).toBe(JSON.stringify(99))
        }),
      ),
    )
  })

Feature('Disposing of a running value')
  .body(({ scenario }) => {
    scenario(
      'A running value that is no longer needed is stopped, and one that must not be interrupted keeps running quietly',
      Gherkin.Do.pipe(
        Given('a page with a running value and one that must not be interrupted')('ctx', () =>
          Effect.sync(() => {
            const running = Atom.make(Effect.never, { initialValue: 1 })
            const guarded = Atom.make(Effect.never, { initialValue: 1, uninterruptible: true })
            const page = Registry.make()
            const stopRunning = page.mount(running)
            const stopGuarded = page.mount(guarded)
            return { page, running, guarded, stopRunning, stopGuarded }
          })),
        When('both values are read, then both are released')('readings', (s) =>
          Effect.sync(() => {
            const before = s.ctx.page.get(s.ctx.running)
            const guardedBefore = s.ctx.page.get(s.ctx.guarded)
            s.ctx.stopRunning()
            s.ctx.stopGuarded()
            const restarted = s.ctx.page.get(s.ctx.running)
            const restartedGuarded = s.ctx.page.get(s.ctx.guarded)
            return { before, guardedBefore, restarted, restartedGuarded }
          })),
        Then('both values showed their stand-in while running, and started over once read again')((s) => {
          expect(Result.isSuccess(s.readings.before) && s.readings.before.waiting && s.readings.before.value === 1)
            .toBe(true)
          expect(
            Result.isSuccess(s.readings.guardedBefore) && s.readings.guardedBefore.waiting &&
              s.readings.guardedBefore.value === 1,
          ).toBe(true)
          expect(
            Result.isSuccess(s.readings.restarted) && s.readings.restarted.waiting && s.readings.restarted.value === 1,
          ).toBe(true)
          expect(
            Result.isSuccess(s.readings.restartedGuarded) && s.readings.restartedGuarded.waiting &&
              s.readings.restartedGuarded.value === 1,
          ).toBe(true)
        }),
      ),
    )
  })

Feature('Working with a value through a page service')
  .body(({ scenario }) => {
    scenario(
      'A value can be read, written, updated, changed, and refreshed through the page service',
      Gherkin.Do.pipe(
        Given('a page with a value')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(0)
            const page = Registry.make()
            return { page, value }
          })),
        When('the value is worked on through the page service')('readings', (s) =>
          Effect.gen(function*() {
            const withPage = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
              Effect.provideService(Registry.AtomRegistry, s.ctx.page)(effect)
            yield* withPage(Atom.mount(s.ctx.value))
            const initial = yield* withPage(Atom.get(s.ctx.value))
            yield* withPage(Atom.set(s.ctx.value, 5))
            const afterSet = yield* withPage(Atom.get(s.ctx.value))
            yield* withPage(Atom.update(s.ctx.value, (n) => n + 1))
            const afterUpdate = yield* withPage(Atom.get(s.ctx.value))
            const doubled = yield* withPage(Atom.modify(s.ctx.value, (n) => [n * 2, n * 2]))
            yield* withPage(Atom.refresh(s.ctx.value))
            const finalValue = yield* withPage(Atom.get(s.ctx.value))
            return { initial, afterSet, afterUpdate, doubled, finalValue }
          })),
        Then('each step saw the value the previous step left behind, and the refresh returned it to its start')((s) => {
          expect(s.readings.initial).toBe(0)
          expect(s.readings.afterSet).toBe(5)
          expect(s.readings.afterUpdate).toBe(6)
          expect(s.readings.doubled).toBe(12)
          expect(s.readings.finalValue).toBe(0)
        }),
      ),
    )
  })

Feature('Building values from other values and from nothing at all')
  .body(({ scenario }) => {
    scenario(
      'A value built from another value follows it, and values built from nothing keep their own shape',
      Gherkin.Do.pipe(
        Given('a page with a value that follows another, and values built from plain recipes')(
          'ctx',
          () =>
            Effect.sync(() => {
              const source = Atom.make(2)
              const tracked = Atom.make((get) => {
                const v = get(source)
                get.subscribe(source, (next) => get.setSelf(next * 10))
                return v * 10
              })
              const nothing = Atom.make<null>(() => null)
              const objectValue = Atom.make(() => ({ n: 1 }))
              const effectValue = Atom.make(() => Effect.succeed(5))
              const page = Registry.make()
              page.mount(tracked)
              return { page, source, tracked, nothing, objectValue, effectValue }
            }),
        ),
        When('the values are read, the source changes, and the following value is read again')(
          'readings',
          (s) =>
            Effect.sync(() => {
              const before = s.ctx.page.get(s.ctx.tracked)
              s.ctx.page.set(s.ctx.source, 3)
              const after = s.ctx.page.get(s.ctx.tracked)
              const nullRead = s.ctx.page.get(s.ctx.nothing)
              const objectRead = s.ctx.page.get(s.ctx.objectValue)
              const effectRead = s.ctx.page.get(s.ctx.effectValue)
              return { before, after, nullRead, objectRead, effectRead }
            }),
        ),
        Then('the following value tracked the change, and each plain value kept its own shape')((s) => {
          expect(s.readings.before).toBe(20)
          expect(s.readings.after).toBe(30)
          expect(s.readings.nullRead).toBeNull()
          expect(s.readings.objectRead).toEqual({ n: 1 })
          expect(Result.isSuccess(s.readings.effectRead) && s.readings.effectRead.value === 5).toBe(true)
        }),
      ),
    )
  })

Feature('Cleaning up a value that was about to update')
  .body(({ scenario }) => {
    scenario(
      'A value that was about to update is cleaned up without firing its pending update',
      Gherkin.Do.pipe(
        Given('a page with a value that waits for quiet, one with a pending update, and one without')(
          'ctx',
          () =>
            Effect.sync(() => {
              vi.useFakeTimers()
              const base = Atom.make(0)
              const withPending = base.pipe(Atom.debounce(100))
              const quiet = base.pipe(Atom.debounce(100))
              const page = Registry.make()
              const stopPending = page.mount(withPending)
              const stopQuiet = page.mount(quiet)
              return { page, base, withPending, stopPending, stopQuiet }
            }),
        ),
        When('the source changes, then both quieted values are released, then time passes')(
          'readings',
          (s) =>
            Effect.sync(() => {
              s.ctx.page.set(s.ctx.base, 1)
              s.ctx.stopPending()
              s.ctx.stopQuiet()
              vi.advanceTimersByTime(200)
              const after = s.ctx.page.get(s.ctx.withPending)
              vi.useRealTimers()
              return { after }
            }),
        ),
        Then('no pending update fired after the values were released, and the value started over from its source')(
          (s) => {
            expect(s.readings.after).toBe(0)
          },
        ),
      ),
    )
  })
