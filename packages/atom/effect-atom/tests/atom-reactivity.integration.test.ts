import { Atom, AtomRef, Registry, Result } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Context, Deferred, Effect, Latch, Layer, Option, Schema, Scope, Stream, SubscriptionRef } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'
import { expect, vi } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Shared page values stay alive, fresh, and consistent while readers use them').body(({ scenario }) => {
  const assertPlainReadsBack = (s: { readonly reading: number }): void => {
    expect(s.reading).toBe(42)
  }

  scenario(
    'A plain value on the page reads back exactly what was set',
    Gherkin.Do.pipe(
      Given('a page holding the number 42')('setup', () =>
        Effect.sync(() => {
          const value = Atom.make(42)
          const page = Registry.make()
          return { page, value }
        })),
      When('the value is read back')('reading', (s) => Effect.sync(() => s.setup.page.get(s.setup.value))),
      Then('the reading matches what was set')(assertPlainReadsBack),
    ),
  )

  const assertComputedStaysInSync = (s: { readonly reading: number }): void => {
    expect(s.reading).toBe(20)
  }

  scenario(
    'A value computed from another value stays in sync with it',
    Gherkin.Do.pipe(
      Given('a base of 10 with a doubled view')('setup', () =>
        Effect.sync(() => {
          const base = Atom.make(10)
          const doubled = Atom.map(base, (n) => n * 2)
          const page = Registry.make()
          return { doubled, page }
        })),
      When('the doubled view is read')('reading', (s) => Effect.sync(() => s.setup.page.get(s.setup.doubled))),
      Then('it shows twice the base')(assertComputedStaysInSync),
    ),
  )

  const assertWriteThroughDerived = (s: {
    readonly readings: {
      readonly afterBase: number
      readonly afterDoubled: number
      readonly afterQuadrupled: number
      readonly beforeDoubled: number
      readonly beforeQuadrupled: number
    }
  }): void => {
    expect(s.readings.beforeDoubled).toBe(20)
    expect(s.readings.beforeQuadrupled).toBe(40)
    expect(s.readings.afterBase).toBe(100)
    expect(s.readings.afterDoubled).toBe(200)
    expect(s.readings.afterQuadrupled).toBe(400)
  }

  scenario(
    'A value derived from another value stays in step even when written through the derived value',
    Gherkin.Do.pipe(
      Given('a base of 10 with doubled and quadrupled views')('setup', () =>
        Effect.sync(() => {
          const base = Atom.make(10)
          const doubled = Atom.map(base, (n) => n * 2)
          const quadrupled = doubled.pipe(Atom.map((n) => n * 2))
          const page = Registry.make()
          return { base, doubled, page, quadrupled }
        })),
      When('100 is written through the doubled view')('readings', (s) =>
        Effect.sync(() => {
          const beforeDoubled = s.setup.page.get(s.setup.doubled)
          const beforeQuadrupled = s.setup.page.get(s.setup.quadrupled)
          s.setup.page.set(s.setup.doubled, 100)
          return {
            afterBase: s.setup.page.get(s.setup.base),
            afterDoubled: s.setup.page.get(s.setup.doubled),
            afterQuadrupled: s.setup.page.get(s.setup.quadrupled),
            beforeDoubled,
            beforeQuadrupled,
          }
        })),
      Then('every view reflects the write')(assertWriteThroughDerived),
    ),
  )

  const assertTrackedFollowsStandaloneKeepsShape = (s: {
    readonly readings: {
      readonly after: number
      readonly before: number
      readonly effectRead: Result.Result<number, never>
      readonly nothing: null
      readonly objectRead: { readonly n: number }
    }
  }): void => {
    expect(s.readings.before).toBe(20)
    expect(s.readings.after).toBe(30)
    expect(s.readings.nothing).toBeNull()
    expect(s.readings.objectRead).toEqual({ n: 1 })
    expect(Result.isSuccess(s.readings.effectRead) && s.readings.effectRead.value === 5).toBe(true)
  }

  scenario(
    'A value built from another value follows it, and values built from nothing keep their own shape',
    Gherkin.Do.pipe(
      Given('a tracked value following a source of 2, plus standalone values')('setup', () =>
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
          return { effectValue, nothing, objectValue, page, source, tracked }
        })),
      When('the source moves from 2 to 3')('readings', (s) =>
        Effect.sync(() => {
          const before = s.setup.page.get(s.setup.tracked)
          s.setup.page.set(s.setup.source, 3)
          return {
            before,
            after: s.setup.page.get(s.setup.tracked),
            effectRead: s.setup.page.get(s.setup.effectValue),
            nothing: s.setup.page.get(s.setup.nothing),
            objectRead: s.setup.page.get(s.setup.objectValue),
          }
        })),
      Then('the tracked value follows and the standalone values keep their shape')(
        assertTrackedFollowsStandaloneKeepsShape,
      ),
    ),
  )

  const assertPageServiceRoundTrip = (s: {
    readonly readings: {
      readonly afterSet: number
      readonly afterUpdate: number
      readonly doubled: number
      readonly finalValue: number
      readonly initial: number
    }
  }): void => {
    expect(s.readings.initial).toBe(0)
    expect(s.readings.afterSet).toBe(5)
    expect(s.readings.afterUpdate).toBe(6)
    expect(s.readings.doubled).toBe(12)
    expect(s.readings.finalValue).toBe(0)
  }

  scenario(
    'A value can be read, written, updated, changed, and refreshed through the page service',
    Gherkin.Do.pipe(
      Given('a mounted value starting at zero')('setup', () =>
        Effect.gen(function*() {
          const value = Atom.make(0)
          const page = Registry.make()
          const withPage = <A, E>(
            effect: Effect.Effect<A, E, Registry.AtomRegistry | Scope.Scope>,
          ): Effect.Effect<A, E, Scope.Scope> => Effect.provideService(Registry.AtomRegistry, page)(effect)
          yield* withPage(Atom.mount(value))
          return { value, withPage }
        })),
      When('it is set, updated, doubled and refreshed in turn')(
        'readings',
        (s) =>
          Effect.scoped(Effect.gen(function*() {
            const initial = yield* s.setup.withPage(Atom.get(s.setup.value))
            yield* s.setup.withPage(Atom.set(s.setup.value, 5))
            const afterSet = yield* s.setup.withPage(Atom.get(s.setup.value))
            yield* s.setup.withPage(Atom.update(s.setup.value, (n) => n + 1))
            const afterUpdate = yield* s.setup.withPage(Atom.get(s.setup.value))
            const doubled = yield* s.setup.withPage(Atom.modify(s.setup.value, (n) => [n * 2, n * 2]))
            yield* s.setup.withPage(Atom.refresh(s.setup.value))
            const finalValue = yield* s.setup.withPage(Atom.get(s.setup.value))
            return { afterSet, afterUpdate, doubled, finalValue, initial }
          })),
      ),
      Then('each step shows the expected reading')(assertPageServiceRoundTrip),
    ),
  )

  const assertOnDemandEmptyUntilAsked = (s: {
    readonly readings: {
      readonly plainAfter: Option.Option<number>
      readonly plainBefore: Option.Option<number>
      readonly withInitialAfter: number
      readonly withInitialBefore: number
      readonly plainFnAfter: Result.Result<number, never>
      readonly plainFnBefore: Result.Result<number, never>
      readonly withInitialFnAfter: Result.Result<number, never>
      readonly withInitialFnBefore: Result.Result<number, never>
    }
  }): void => {
    expect(Option.isNone(s.readings.plainBefore)).toBe(true)
    expect(s.readings.withInitialBefore).toBe(0)
    expect(Result.isInitial(s.readings.plainFnBefore)).toBe(true)
    expect(
      Result.isSuccess(s.readings.withInitialFnBefore) && s.readings.withInitialFnBefore.value === 0,
    ).toBe(true)
    const plainAfter = s.readings.plainAfter
    expect(Option.isSome(plainAfter) && plainAfter.value === 6).toBe(true)
    expect(s.readings.withInitialAfter).toBe(5)
    expect(Result.isSuccess(s.readings.plainFnAfter) && s.readings.plainFnAfter.value === 20).toBe(true)
    expect(Result.isSuccess(s.readings.withInitialFnAfter) && s.readings.withInitialFnAfter.value === 6).toBe(
      true,
    )
  }

  scenario(
    'A value requested on demand stays empty until it is asked for, and a value with a stand-in starts filled in',
    Gherkin.Do.pipe(
      Given('four unrequested computations, two carrying stand-ins')('setup', () =>
        Effect.sync(() => {
          const plain = Atom.fnSync<number>()((n) => n * 2)
          const withInitial = Atom.fnSync<number>()((n) => n + 1, { initialValue: 0 })
          const plainFn = Atom.fn<number>()((n) => Effect.succeed(n * 10))
          const withInitialFn = Atom.fn((n: number) => Effect.succeed(n + 1), { initialValue: 0 })
          const page = Registry.make()
          return { page, plain, plainFn, withInitial, withInitialFn }
        })),
      When('each computation is invoked once')('readings', (s) =>
        Effect.sync(() => {
          const plainBefore = s.setup.page.get(s.setup.plain)
          const withInitialBefore = s.setup.page.get(s.setup.withInitial)
          const plainFnBefore = s.setup.page.get(s.setup.plainFn)
          const withInitialFnBefore = s.setup.page.get(s.setup.withInitialFn)
          s.setup.page.set(s.setup.plain, 3)
          s.setup.page.set(s.setup.withInitial, 4)
          s.setup.page.set(s.setup.plainFn, 2)
          s.setup.page.set(s.setup.withInitialFn, 5)
          return {
            plainAfter: s.setup.page.get(s.setup.plain),
            plainBefore,
            withInitialAfter: s.setup.page.get(s.setup.withInitial),
            withInitialBefore,
            plainFnAfter: s.setup.page.get(s.setup.plainFn),
            plainFnBefore,
            withInitialFnAfter: s.setup.page.get(s.setup.withInitialFn),
            withInitialFnBefore,
          }
        })),
      Then('the empty ones start empty and every invocation answers')(assertOnDemandEmptyUntilAsked),
    ),
  )

  const assertMappedViewsShowOutcomes = (s: {
    readonly readings: {
      readonly after: Result.Result<number, never>
      readonly afterAgain: Result.Result<number, never>
      readonly before: Result.Result<number, never>
    }
  }): void => {
    expect(Result.isInitial(s.readings.before)).toBe(true)
    expect(Result.isSuccess(s.readings.after) && s.readings.after.value === 20).toBe(true)
    expect(Result.isSuccess(s.readings.afterAgain) && s.readings.afterAgain.value === 21).toBe(true)
  }

  scenario(
    'A value derived from a value that loads shows the mapped outcome once it arrives',
    Gherkin.Do.pipe(
      Given('a loader with two chained mapped views')('setup', () =>
        Effect.sync(() => {
          const count = Atom.fn((n: number) => Effect.succeed(n + 1))
          const mapped = count.pipe(Atom.mapResult((v) => v * 10))
          const mappedAgain = Atom.mapResult(mapped, (v) => v + 1)
          const page = Registry.make()
          return { mapped, mappedAgain, count, page }
        })),
      When('the loader is given 1')('readings', (s) =>
        Effect.sync(() => {
          const before = s.setup.page.get(s.setup.mapped)
          s.setup.page.set(s.setup.count, 1)
          return {
            after: s.setup.page.get(s.setup.mapped),
            afterAgain: s.setup.page.get(s.setup.mappedAgain),
            before,
          }
        })),
      Then('both views show the mapped outcomes')(assertMappedViewsShowOutcomes),
    ),
  )

  const assertInterruptedTaskLifecycle = (s: {
    readonly readings: {
      readonly before: Result.Result<void, never>
      readonly finished: Result.Result<void, never>
      readonly interrupted: Result.Result<void, never>
      readonly reset: Result.Result<void, never>
      readonly restarted: Result.Result<void, never>
      readonly running: Result.Result<void, never>
    }
  }): void => {
    expect(Result.isInitial(s.readings.before)).toBe(true)
    expect(Result.isInitial(s.readings.running) && s.readings.running.waiting).toBe(true)
    expect(Result.isFailure(s.readings.interrupted)).toBe(true)
    expect(Result.isInitial(s.readings.reset)).toBe(true)
    expect(Result.isInitial(s.readings.restarted) && s.readings.restarted.waiting).toBe(true)
    expect(Result.isSuccess(s.readings.finished)).toBe(true)
  }

  scenario(
    'A computation that is interrupted can be reset and started again',
    Gherkin.Do.pipe(
      Given('a mounted task blocked on a gate')('setup', () =>
        Effect.sync(() => {
          const latch = Latch.makeUnsafe()
          const task = Atom.fn(() => latch.await)
          const page = Registry.make()
          page.mount(task)
          return { latch, page, task }
        })),
      When('it runs, is interrupted, is reset, and starts again')('readings', (s) =>
        Effect.gen(function*() {
          const before = s.setup.page.get(s.setup.task)
          s.setup.page.set(s.setup.task, void 0)
          const running = s.setup.page.get(s.setup.task)
          s.setup.page.set(s.setup.task, Atom.Interrupt)
          const interrupted = s.setup.page.get(s.setup.task)
          s.setup.page.set(s.setup.task, Atom.Reset)
          const reset = s.setup.page.get(s.setup.task)
          s.setup.page.set(s.setup.task, void 0)
          const restarted = s.setup.page.get(s.setup.task)
          s.setup.latch.openUnsafe()
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const finished = s.setup.page.get(s.setup.task)
          return { before, finished, interrupted, reset, restarted, running }
        })),
      Then('each phase of its life is visible')(assertInterruptedTaskLifecycle),
    ),
  )

  const assertConcurrentRunsAllFinish = (s: {
    readonly readings: {
      readonly after: Result.Result<void, never>
      readonly before: Result.Result<void, never>
      readonly during: Result.Result<void, never>
      readonly finishedAfter: number
      readonly finishedBefore: number
      readonly started: number
    }
  }): void => {
    expect(Result.isInitial(s.readings.before)).toBe(true)
    expect(Result.isInitial(s.readings.during) && s.readings.during.waiting).toBe(true)
    expect(s.readings.started).toBe(3)
    expect(s.readings.finishedBefore).toBe(0)
    expect(s.readings.finishedAfter).toBe(3)
    expect(Result.isSuccess(s.readings.after)).toBe(true)
  }

  scenario(
    'Several runs of a computation proceed side by side and all finish',
    Gherkin.Do.pipe(
      Given('a mounted task that allows runs side by side')('setup', () =>
        Effect.sync(() => {
          const latches: Latch.Latch[] = []
          const cell = { done: 0 }
          const task = Atom.fn((_: number) => {
            const latch = Latch.makeUnsafe()
            latches.push(latch)
            return latch.await.pipe(Effect.tap(() => Effect.sync(() => cell.done++)))
          }, { concurrent: true })
          const page = Registry.make()
          page.mount(task)
          return { cell, latches, page, task }
        })),
      When('three runs are submitted and every gate opens')('readings', (s) =>
        Effect.gen(function*() {
          const before = s.setup.page.get(s.setup.task)
          s.setup.page.set(s.setup.task, 1)
          s.setup.page.set(s.setup.task, 2)
          s.setup.page.set(s.setup.task, 3)
          const during = s.setup.page.get(s.setup.task)
          const started = s.setup.latches.length
          const finishedBefore = s.setup.cell.done
          s.setup.latches.forEach((latch) => latch.openUnsafe())
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const finishedAfter = s.setup.cell.done
          const after = s.setup.page.get(s.setup.task)
          return { after, before, during, finishedAfter, finishedBefore, started }
        })),
      Then('all three runs finish together')(assertConcurrentRunsAllFinish),
    ),
  )

  const assertStreamedResultFillsIn = (s: {
    readonly readings: {
      readonly after: Result.Result<number, Cause.NoSuchElementError>
      readonly before: Result.Result<number, Cause.NoSuchElementError>
      readonly during: Result.Result<number, Cause.NoSuchElementError>
    }
  }): void => {
    expect(Result.isInitial(s.readings.before)).toBe(true)
    expect(Result.isInitial(s.readings.during) && s.readings.during.waiting).toBe(true)
    expect(
      Result.isSuccess(s.readings.after) && !s.readings.after.waiting && s.readings.after.value === 2,
    ).toBe(true)
  }

  scenario(
    'A value that streams its result fills in once the pieces arrive',
    Gherkin.Do.pipe(
      Given('a mounted streaming computation waiting on a signal')('setup', () =>
        Effect.sync(() => {
          const gate = Deferred.makeUnsafe<number>()
          const count = Atom.fn((start: number) => Stream.fromEffect(Deferred.await(gate).pipe(Effect.as(start + 1))))
          const page = Registry.make()
          page.mount(count)
          return { count, gate, page }
        })),
      When('it is invoked and the signal arrives')('readings', (s) =>
        Effect.gen(function*() {
          const before = s.setup.page.get(s.setup.count)
          s.setup.page.set(s.setup.count, 1)
          const during = s.setup.page.get(s.setup.count)
          yield* Deferred.succeed(s.setup.gate, 1)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const after = s.setup.page.get(s.setup.count)
          return { after, before, during }
        })),
      Then('the result fills in once the pieces arrive')(assertStreamedResultFillsIn),
    ),
  )
  const assertNeverLoadingStaysLoading = (s: {
    readonly readings: { readonly first: Result.Result<never, never>; readonly second: Result.Result<never, never> }
  }): void => {
    expect(Result.isInitial(s.readings.first)).toBe(true)
    expect(Result.isInitial(s.readings.second)).toBe(true)
  }

  scenario(
    'A value that never finishes loading still reports loading after being asked to refresh',
    Gherkin.Do.pipe(
      Given('a value that never finishes loading')('setup', () =>
        Effect.sync(() => {
          const value = Atom.make(Effect.never)
          const page = Registry.make()
          return { page, value }
        })),
      When('a refresh is requested')('readings', (s) =>
        Effect.sync(() => {
          const firstReading = s.setup.page.get(s.setup.value)
          s.setup.page.refresh(s.setup.value)
          return { first: firstReading, second: s.setup.page.get(s.setup.value) }
        })),
      Then('it still reports loading')(assertNeverLoadingStaysLoading),
    ),
  )

  const assertStandInUntilFetchAnswers = (s: {
    readonly readings: { readonly after: Result.Result<number, never>; readonly before: Result.Result<number, never> }
  }): void => {
    expect(Result.isSuccess(s.readings.before) && s.readings.before.waiting && s.readings.before.value === 0).toBe(
      true,
    )
    expect(Result.isSuccess(s.readings.after) && !s.readings.after.waiting && s.readings.after.value === 1).toBe(
      true,
    )
  }

  scenario(
    'A value with a stand-in shows the stand-in until the fetch answers, then the real answer',
    Gherkin.Do.pipe(
      Given('a mounted value with a zero stand-in behind a gate')('setup', () =>
        Effect.sync(() => {
          const gate = Deferred.makeUnsafe<number>()
          const value = Atom.make(Deferred.await(gate), { initialValue: 0 })
          const page = Registry.make()
          page.mount(value)
          return { gate, page, value }
        })),
      When('the gate answers 1')('readings', (s) =>
        Effect.gen(function*() {
          const before = s.setup.page.get(s.setup.value)
          yield* Deferred.succeed(s.setup.gate, 1)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const after = s.setup.page.get(s.setup.value)
          return { after, before }
        })),
      Then('the stand-in shows first, then the real answer')(assertStandInUntilFetchAnswers),
    ),
  )

  const assertStreamedStandInKeepsAcrossRefresh = (s: {
    readonly readings: {
      readonly afterRefresh: Result.Result<number, Cause.NoSuchElementError>
      readonly before: Result.Result<number, Cause.NoSuchElementError>
      readonly loaded: Result.Result<number, Cause.NoSuchElementError>
      readonly settled: Result.Result<number, Cause.NoSuchElementError>
    }
  }): void => {
    expect(Result.isSuccess(s.readings.before) && s.readings.before.waiting && s.readings.before.value === 0).toBe(
      true,
    )
    expect(Result.isSuccess(s.readings.loaded) && s.readings.loaded.value === 5).toBe(true)
    expect(Result.isSuccess(s.readings.afterRefresh) && s.readings.afterRefresh.value === 5).toBe(true)
    expect(
      Result.isSuccess(s.readings.settled) && !s.readings.settled.waiting && s.readings.settled.value === 5,
    ).toBe(true)
  }

  scenario(
    'A streamed value shows its stand-in first, then the real answer, and keeps it across a refresh',
    Gherkin.Do.pipe(
      Given('a mounted streamed value with a zero stand-in behind a gate')('setup', () =>
        Effect.sync(() => {
          const gate = Deferred.makeUnsafe<number>()
          const value = Atom.make(Stream.fromEffect(Deferred.await(gate)), { initialValue: 0 })
          const page = Registry.make()
          page.mount(value)
          return { gate, page, value }
        })),
      When('the gate answers 5 and a refresh follows')('readings', (s) =>
        Effect.gen(function*() {
          const before = s.setup.page.get(s.setup.value)
          yield* Deferred.succeed(s.setup.gate, 5)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const loaded = s.setup.page.get(s.setup.value)
          s.setup.page.refresh(s.setup.value)
          const afterRefresh = s.setup.page.get(s.setup.value)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const settled = s.setup.page.get(s.setup.value)
          return { afterRefresh, before, loaded, settled }
        })),
      Then('the stand-in shows first and the real answer survives the refresh')(
        assertStreamedStandInKeepsAcrossRefresh,
      ),
    ),
  )

  const assertStreamsReportTheirOwnFate = (s: {
    readonly readings: {
      readonly emptyResult: Result.Result<unknown, unknown>
      readonly failingResult: Result.Result<unknown, unknown>
      readonly streamedResult: Result.Result<number, unknown>
    }
  }): void => {
    expect(Result.isFailure(s.readings.emptyResult)).toBe(true)
    expect(Result.isFailure(s.readings.failingResult)).toBe(true)
    expect(Result.isSuccess(s.readings.streamedResult) && s.readings.streamedResult.value === 7).toBe(true)
  }

  scenario(
    'A streamed value that runs dry, one that fails, and one read from a plain recipe all report their own fate',
    Gherkin.Do.pipe(
      Given('three mounted streams: one that runs dry, one that fails, one plain')('setup', () =>
        Effect.sync(() => {
          const empty = Atom.make(Stream.empty)
          const failing = Atom.make(Stream.fail('boom' as const))
          const streamed = Atom.make(() => Stream.succeed(7))
          const page = Registry.make()
          page.mount(empty)
          page.mount(failing)
          page.mount(streamed)
          return { empty, failing, page, streamed }
        })),
      When('the runtime settles')('readings', (s) =>
        Effect.gen(function*() {
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const emptyResult = s.setup.page.get(s.setup.empty)
          const failingResult = s.setup.page.get(s.setup.failing)
          const streamedResult = s.setup.page.get(s.setup.streamed)
          return { emptyResult, failingResult, streamedResult }
        })),
      Then('each stream reports its own fate')(assertStreamsReportTheirOwnFate),
    ),
  )

  const assertUnneededStopsGuardedKeepsRunning = (s: {
    readonly readings: {
      readonly afterGuarded: Result.Result<number, never>
      readonly afterRunning: Result.Result<number, never>
      readonly beforeGuarded: Result.Result<number, never>
      readonly beforeRunning: Result.Result<number, never>
    }
  }): void => {
    expect(
      Result.isSuccess(s.readings.beforeRunning) && s.readings.beforeRunning.waiting &&
        s.readings.beforeRunning.value === 1,
    ).toBe(true)
    expect(
      Result.isSuccess(s.readings.beforeGuarded) && s.readings.beforeGuarded.waiting &&
        s.readings.beforeGuarded.value === 1,
    ).toBe(true)
    expect(
      Result.isSuccess(s.readings.afterRunning) && s.readings.afterRunning.waiting &&
        s.readings.afterRunning.value === 1,
    ).toBe(true)
    expect(
      Result.isSuccess(s.readings.afterGuarded) && s.readings.afterGuarded.waiting &&
        s.readings.afterGuarded.value === 1,
    ).toBe(true)
  }

  scenario(
    'A running value that is no longer needed is stopped, and one that must not be interrupted keeps running quietly',
    Gherkin.Do.pipe(
      Given('two mounted never-ending values, one guarded against interruption')('setup', () =>
        Effect.sync(() => {
          const running = Atom.make(Effect.never, { initialValue: 1 })
          const guarded = Atom.make(Effect.never, { initialValue: 1, uninterruptible: true })
          const page = Registry.make()
          const stopRunning = page.mount(running)
          const stopGuarded = page.mount(guarded)
          return { guarded, page, running, stopGuarded, stopRunning }
        })),
      When('both are unmounted and read again')('readings', (s) =>
        Effect.sync(() => {
          const beforeRunning = s.setup.page.get(s.setup.running)
          const beforeGuarded = s.setup.page.get(s.setup.guarded)
          s.setup.stopRunning()
          s.setup.stopGuarded()
          return {
            afterGuarded: s.setup.page.get(s.setup.guarded),
            afterRunning: s.setup.page.get(s.setup.running),
            beforeGuarded,
            beforeRunning,
          }
        })),
      Then('both restart loading on the next read')(assertUnneededStopsGuardedKeepsRunning),
    ),
  )
  const assertStandInWhileSourceLoads = (s: {
    readonly reading: Result.Result<unknown, unknown> | Result.Result<'cached', never>
  }): void => {
    expect(Result.isSuccess(s.reading) && s.reading.value === 'cached' && s.reading.waiting).toBe(true)
  }

  scenario(
    'A value with a stand-in shows the stand-in while the source is still loading',
    Gherkin.Do.pipe(
      Given('a never-loading source with a cached stand-in')('setup', () =>
        Effect.sync(() => {
          const source = Atom.make(Effect.never)
          const withStandIn = source.pipe(Atom.withFallback(Atom.make(Result.success('cached' as const))))
          const page = Registry.make()
          return { page, withStandIn }
        })),
      When('the combined value is read')('reading', (s) => Effect.sync(() => s.setup.page.get(s.setup.withStandIn))),
      Then('the stand-in shows as waiting')(assertStandInWhileSourceLoads),
    ),
  )

  const assertRealOutcomeReplacesStandIn = (s: {
    readonly reading: Result.Result<unknown, unknown> | Result.Result<'cached', never>
  }): void => {
    expect(Result.isFailure(s.reading)).toBe(true)
  }

  scenario(
    'Once the source finishes, its real outcome replaces the stand-in',
    Gherkin.Do.pipe(
      Given('a failing source with a cached stand-in, already read once')('setup', () =>
        Effect.sync(() => {
          const source = Atom.make(Effect.fail('down' as const))
          const withStandIn = source.pipe(Atom.withFallback(Atom.make(Result.success('cached' as const))))
          const page = Registry.make()
          page.get(withStandIn)
          page.refresh(withStandIn)
          return { page, withStandIn }
        })),
      When('the refreshed value is read')('reading', (s) => Effect.sync(() => s.setup.page.get(s.setup.withStandIn))),
      Then('the failure replaces the stand-in')(assertRealOutcomeReplacesStandIn),
    ),
  )

  const assertWritableFallbackWriteThrough = (s: {
    readonly readings: {
      readonly after: Result.Result<unknown, unknown> | Result.Result<'cached', never>
      readonly before: Result.Result<unknown, unknown> | Result.Result<'cached', never>
      readonly mappedAfter: Result.Result<unknown, unknown> | Result.Result<'cached', never>
      readonly mappedBefore: Result.Result<unknown, unknown> | Result.Result<'cached', never>
    }
  }): void => {
    expect(Result.isSuccess(s.readings.before) && s.readings.before.waiting && s.readings.before.value === 'cached')
      .toBe(true)
    expect(
      Result.isSuccess(s.readings.mappedBefore) && s.readings.mappedBefore.waiting &&
        s.readings.mappedBefore.value === 'cached',
    ).toBe(true)
    expect(Result.isSuccess(s.readings.after) && !s.readings.after.waiting && s.readings.after.value === '1').toBe(
      true,
    )
    expect(
      Result.isSuccess(s.readings.mappedAfter) && !s.readings.mappedAfter.waiting &&
        s.readings.mappedAfter.value === '2!',
    ).toBe(true)
  }

  scenario(
    'A writable value with a stored copy shows the copy until it runs, and writes go through to it',
    Gherkin.Do.pipe(
      Given('a loader with a cached stand-in and a mapped twin')('setup', () =>
        Effect.sync(() => {
          const fallback = Atom.make(Result.success('cached' as const))
          const source = Atom.fn((n: number) => Effect.succeed(String(n)))
          const withStandIn = source.pipe(Atom.withFallback(fallback))
          const mappedSource = source.pipe(Atom.mapResult((v) => `${v}!`))
          const mappedWithStandIn = mappedSource.pipe(Atom.withFallback(fallback))
          const page = Registry.make()
          return { mappedWithStandIn, page, withStandIn }
        })),
      When('each combined value is written once')('readings', (s) =>
        Effect.sync(() => {
          const before = s.setup.page.get(s.setup.withStandIn)
          const mappedBefore = s.setup.page.get(s.setup.mappedWithStandIn)
          s.setup.page.set(s.setup.withStandIn, 1)
          const after = s.setup.page.get(s.setup.withStandIn)
          s.setup.page.set(s.setup.mappedWithStandIn, 2)
          const mappedAfter = s.setup.page.get(s.setup.mappedWithStandIn)
          return { after, before, mappedAfter, mappedBefore }
        })),
      Then('the copy shows first and writes run through')(assertWritableFallbackWriteThrough),
    ),
  )
  const assertRejectedChangeDisappears = (s: {
    readonly readings: { readonly afterRejection: number; readonly before: number; readonly whilePending: number }
  }): void => {
    expect(s.readings.before).toBe(1)
    expect(s.readings.whilePending).toBe(99)
    expect(s.readings.afterRejection).toBe(1)
  }

  scenario(
    'A change shows up right away and disappears when the confirmation is rejected',
    Gherkin.Do.pipe(
      Given('a saved value of 1 with a gated confirmation')('setup', () =>
        Effect.sync(() => {
          const latch = Latch.makeUnsafe()
          const cell = { stored: 1 }
          const source = Atom.make(() => cell.stored)
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
          return { cell, latch, optimisticValue, page, save }
        })),
      When('99 is submitted and the confirmation rejects')('readings', (s) =>
        Effect.gen(function*() {
          const before = s.setup.page.get(s.setup.optimisticValue)
          s.setup.page.set(s.setup.save, 99)
          const whilePending = s.setup.page.get(s.setup.optimisticValue)
          s.setup.latch.openUnsafe()
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const afterRejection = s.setup.page.get(s.setup.optimisticValue)
          return { afterRejection, before, whilePending }
        })),
      Then('the change appears at once, then disappears')(assertRejectedChangeDisappears),
    ),
  )

  const assertConfirmedChangeStays = (s: {
    readonly readings: { readonly afterConfirmation: number; readonly whilePending: number }
  }): void => {
    expect(s.readings.whilePending).toBe(99)
    expect(s.readings.afterConfirmation).toBe(99)
  }

  scenario(
    'A change that is confirmed stays, refreshed from the store',
    Gherkin.Do.pipe(
      Given('a saved value of 1 with a gated confirmation')('setup', () =>
        Effect.sync(() => {
          const latch = Latch.makeUnsafe()
          const cell = { stored: 1 }
          const source = Atom.make(() => cell.stored)
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
          return { cell, latch, optimisticValue, page, save }
        })),
      When('99 is submitted, the store records it, and the gate opens')('readings', (s) =>
        Effect.gen(function*() {
          s.setup.page.set(s.setup.save, 99)
          const whilePending = s.setup.page.get(s.setup.optimisticValue)
          s.setup.cell.stored = 99
          s.setup.latch.openUnsafe()
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const afterConfirmation = s.setup.page.get(s.setup.optimisticValue)
          return { afterConfirmation, whilePending }
        })),
      Then('the confirmed value stays')(assertConfirmedChangeStays),
    ),
  )

  const assertInFlightChangeReportsProgress = (s: {
    readonly readings: {
      readonly afterConfirmation: Result.Result<number, unknown>
      readonly whilePending: Result.Result<number, unknown>
    }
  }): void => {
    expect(
      Result.isSuccess(s.readings.whilePending) && s.readings.whilePending.waiting &&
        s.readings.whilePending.value === 99,
    ).toBe(true)
    expect(
      Result.isSuccess(s.readings.afterConfirmation) && s.readings.afterConfirmation.value === 99 &&
        !s.readings.afterConfirmation.waiting,
    ).toBe(true)
  }

  scenario(
    'A change whose confirmation is still running reports itself as in flight',
    Gherkin.Do.pipe(
      Given('a saved value whose working copy marks progress')('setup', () =>
        Effect.sync(() => {
          const latch = Latch.makeUnsafe()
          const cell = { stored: 1 }
          const source = Atom.make(Effect.sync(() => cell.stored))
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
          return { cell, latch, optimisticValue, page, save }
        })),
      When('99 is submitted, the store records it, and the gate opens')('readings', (s) =>
        Effect.gen(function*() {
          s.setup.page.set(s.setup.save, 99)
          const whilePending = s.setup.page.get(s.setup.optimisticValue)
          s.setup.cell.stored = 99
          s.setup.latch.openUnsafe()
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const afterConfirmation = s.setup.page.get(s.setup.optimisticValue)
          return { afterConfirmation, whilePending }
        })),
      Then('progress shows in flight, then settles')(assertInFlightChangeReportsProgress),
    ),
  )

  const assertWorkingCopyReportsProgress = (s: {
    readonly readings: {
      readonly afterConfirmation: number
      readonly afterConfirmation2: Result.Result<number, unknown>
      readonly before: number
      readonly before2: Result.Result<number, unknown>
      readonly whilePending: number
      readonly whilePending2: Result.Result<number, unknown>
    }
  }): void => {
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
  }

  scenario(
    'A change confirmed through a working copy reports its progress and then the confirmed value',
    Gherkin.Do.pipe(
      Given('two saved values reporting progress through working copies')('setup', () =>
        Effect.sync(() => {
          const latch = Latch.makeUnsafe()
          const cell = { stored: 1 }
          const source = Atom.make(() => cell.stored)
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
          const cell2 = { stored: 1 }
          const source2 = Atom.make(Effect.sync(() => cell2.stored))
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
          return { cell, cell2, latch, latch2, optimistic2, optimisticValue, page, save, save2 }
        })),
      When('both changes are submitted and both gates open')('readings', (s) =>
        Effect.gen(function*() {
          const before = s.setup.page.get(s.setup.optimisticValue)
          s.setup.page.set(s.setup.save, 99)
          const whilePending = s.setup.page.get(s.setup.optimisticValue)
          s.setup.page.set(s.setup.save, 99)
          s.setup.cell.stored = 99
          s.setup.latch.openUnsafe()
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const afterConfirmation = s.setup.page.get(s.setup.optimisticValue)
          const before2 = s.setup.page.get(s.setup.optimistic2)
          s.setup.page.set(s.setup.save2, 99)
          const whilePending2 = s.setup.page.get(s.setup.optimistic2)
          s.setup.cell2.stored = 99
          s.setup.latch2.openUnsafe()
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const afterConfirmation2 = s.setup.page.get(s.setup.optimistic2)
          return { afterConfirmation, afterConfirmation2, before, before2, whilePending, whilePending2 }
        })),
      Then('each working copy shows progress, then the confirmed value')(assertWorkingCopyReportsProgress),
    ),
  )

  const assertImmediateAcceptSettles = (s: { readonly readings: { readonly afterConfirmation: number } }): void => {
    expect(s.readings.afterConfirmation).toBe(99)
  }

  scenario(
    'A change that is accepted right away settles on the confirmed value without waiting',
    Gherkin.Do.pipe(
      Given('a saved value whose confirmation answers at once')('setup', () =>
        Effect.sync(() => {
          const cell = { stored: 1 }
          const source = Atom.make(() => cell.stored)
          const optimisticValue = source.pipe(Atom.optimistic)
          const save = optimisticValue.pipe(
            Atom.optimisticFn({
              reducer: (_current, update: number) => update,
              fn: Atom.fn((n: number) => Effect.succeed(n)),
            }),
            Atom.keepAlive,
          )
          const page = Registry.make()
          return { cell, optimisticValue, page, save }
        })),
      When('99 is submitted and the store records it')('readings', (s) =>
        Effect.gen(function*() {
          s.setup.page.set(s.setup.save, 99)
          s.setup.cell.stored = 99
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const afterConfirmation = s.setup.page.get(s.setup.optimisticValue)
          return { afterConfirmation }
        })),
      Then('the confirmed value shows without waiting')(assertImmediateAcceptSettles),
    ),
  )
  const assertBurstArrivesAsOne = (s: {
    readonly readings: { readonly afterQuiet: number; readonly duringBurst: number }
  }): void => {
    try {
      expect(s.readings.duringBurst).toBe(0)
      expect(s.readings.afterQuiet).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  }

  scenario(
    'A burst of quick edits arrives as one final value',
    Gherkin.Do.pipe(
      Given('a quieted view of a base value with the clock held')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const base = Atom.make(0)
          const quieted = base.pipe(Atom.debounce(100))
          const page = Registry.make()
          page.mount(quieted)
          return { base, page, quieted }
        })),
      When('three quick edits land, then quiet time passes')('readings', (s) =>
        Effect.sync(() => {
          s.setup.page.set(s.setup.base, 1)
          s.setup.page.set(s.setup.base, 2)
          s.setup.page.set(s.setup.base, 3)
          const duringBurst = s.setup.page.get(s.setup.quieted)
          vi.advanceTimersByTime(150)
          const afterQuiet = s.setup.page.get(s.setup.quieted)
          return { afterQuiet, duringBurst }
        })),
      Then('only the final value arrives')(assertBurstArrivesAsOne),
    ),
  )

  const assertPendingUpdateCleanedUp = (s: { readonly reading: number }): void => {
    try {
      expect(s.reading).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  }

  scenario(
    'A value that was about to update is cleaned up without firing its pending update',
    Gherkin.Do.pipe(
      Given('two mounted quieted views with the clock held')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const base = Atom.make(0)
          const withPending = base.pipe(Atom.debounce(100))
          const quiet = base.pipe(Atom.debounce(100))
          const page = Registry.make()
          const stopPending = page.mount(withPending)
          const stopQuiet = page.mount(quiet)
          return { base, page, stopPending, stopQuiet, withPending }
        })),
      When('an edit lands but both views go away first')('reading', (s) =>
        Effect.sync(() => {
          s.setup.page.set(s.setup.base, 1)
          s.setup.stopPending()
          s.setup.stopQuiet()
          vi.advanceTimersByTime(200)
          return s.setup.page.get(s.setup.withPending)
        })),
      Then('no pending update fires')(assertPendingUpdateCleanedUp),
    ),
  )

  const assertShortTimerCleansUp = (s: { readonly restarted: number }): void => {
    try {
      expect(s.restarted).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  }

  scenario(
    'A value with a short custom timer is cleaned up even when the page default is long',
    Gherkin.Do.pipe(
      Given('a value with a short idle timer on a long-default page, clock held')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const cell = { starts: 0 }
          const value = Atom.make(Effect.sync(() => {
            cell.starts++
            return 1
          })).pipe(Atom.setIdleTTL(10))
          const page = Registry.make({ defaultIdleTTL: 10_000, timeoutResolution: 10 })
          return { cell, page, value }
        })),
      When('it is read, time passes, and it is read again')('restarted', (s) =>
        Effect.sync(() => {
          s.setup.page.get(s.setup.value)
          vi.advanceTimersByTime(100)
          s.setup.page.get(s.setup.value)
          return s.setup.cell.starts
        })),
      Then('it restarts from scratch')(assertShortTimerCleansUp),
    ),
  )

  const assertIdleFamilyMemberRebuilt = (s: { readonly rebuilt: number }): void => {
    try {
      expect(s.rebuilt).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  }

  scenario(
    'A family member nobody uses is cleaned up while the family lives on',
    Gherkin.Do.pipe(
      Given('a family of values with a short idle timer, clock held')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const cell = { starts: 0 }
          const family = Atom.family((id: number) =>
            Atom.make(Effect.callback<number>((resume) => {
              cell.starts++
              resume(Effect.succeed(id))
            }))
          )
          const page = Registry.make({ defaultIdleTTL: 10 })
          return { cell, family, page }
        })),
      When('one member is read, time passes, and it is read again')('rebuilt', (s) =>
        Effect.sync(() => {
          s.setup.page.get(s.setup.family(7))
          vi.advanceTimersByTime(100)
          s.setup.page.get(s.setup.family(7))
          return s.setup.cell.starts
        })),
      Then('the member is rebuilt')(assertIdleFamilyMemberRebuilt),
    ),
  )

  const assertStaleValueRefreshesItself = (s: {
    readonly readings: {
      readonly fresh: Result.Result<number, never>
      readonly revalidated: Result.Result<number, never>
    }
  }): void => {
    try {
      expect(Result.isSuccess(s.readings.fresh) && s.readings.fresh.value === 1).toBe(true)
      expect(Result.isSuccess(s.readings.revalidated) && s.readings.revalidated.value === 2).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  }

  scenario(
    'A value past its stale time refreshes itself when read again',
    Gherkin.Do.pipe(
      Given('a cached value with a short fresh window, clock held')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const cell = { stored: 1 }
          const source = Atom.make(Effect.sync(() => cell.stored))
          const staleAware = source.pipe(Atom.swr({ staleTime: 100 }))
          const page = Registry.make()
          return { cell, page, staleAware }
        })),
      When('the store changes and the window lapses')('readings', (s) =>
        Effect.sync(() => {
          s.setup.page.get(s.setup.staleAware)
          s.setup.page.refresh(s.setup.staleAware)
          const fresh = s.setup.page.get(s.setup.staleAware)
          s.setup.cell.stored = 2
          vi.advanceTimersByTime(200)
          s.setup.page.get(s.setup.staleAware)
          const revalidated = s.setup.page.get(s.setup.staleAware)
          return { fresh, revalidated }
        })),
      Then('the next read refreshes itself')(assertStaleValueRefreshesItself),
    ),
  )

  const assertFocusRegainsRefresh = (s: {
    readonly readings: {
      readonly first: Result.Result<number, never>
      readonly firstAlways: Result.Result<number, never>
      readonly revalidated: Result.Result<number, never>
      readonly revalidatedAlways: Result.Result<number, never>
    }
  }): void => {
    try {
      expect(Result.isSuccess(s.readings.first) && s.readings.first.value === 1).toBe(true)
      expect(Result.isSuccess(s.readings.firstAlways) && s.readings.firstAlways.value === 1).toBe(true)
      expect(Result.isSuccess(s.readings.revalidated) && s.readings.revalidated.value === 2).toBe(true)
      expect(Result.isSuccess(s.readings.revalidatedAlways) && s.readings.revalidatedAlways.value === 2).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  }

  scenario(
    'A value past its fresh time refreshes when the page regains attention, and one set to always refresh does too',
    Gherkin.Do.pipe(
      Given('two cached views watching for renewed attention, clock held')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const cell = { stored: 1 }
          const source = Atom.make(Effect.sync(() => cell.stored))
          const focus = Atom.make(0)
          const onFocus = source.pipe(Atom.swr({ staleTime: 100, revalidateOnFocus: true, focusSignal: focus }))
          const alwaysOnFocus = source.pipe(
            Atom.swr({ staleTime: 100, revalidateOnFocus: 'always', focusSignal: focus }),
          )
          const page = Registry.make()
          return { alwaysOnFocus, cell, focus, onFocus, page }
        })),
      When('the store changes, time lapses, and attention returns')('readings', (s) =>
        Effect.sync(() => {
          const first = s.setup.page.get(s.setup.onFocus)
          const firstAlways = s.setup.page.get(s.setup.alwaysOnFocus)
          s.setup.cell.stored = 2
          vi.advanceTimersByTime(200)
          s.setup.page.set(s.setup.focus, 1)
          const revalidated = s.setup.page.get(s.setup.onFocus)
          const revalidatedAlways = s.setup.page.get(s.setup.alwaysOnFocus)
          return { first, firstAlways, revalidated, revalidatedAlways }
        })),
      Then('both refresh on renewed attention')(assertFocusRegainsRefresh),
    ),
  )

  const assertStaleOnMountWaitsForAsk = (s: {
    readonly readings: {
      readonly first: Result.Result<number, never>
      readonly readsAfterFirst: number
      readonly readsAfterSecond: number
      readonly second: Result.Result<number, never>
    }
  }): void => {
    expect(Result.isSuccess(s.readings.first) && s.readings.first.value === 1).toBe(true)
    expect(s.readings.readsAfterFirst).toBe(1)
    expect(Result.isSuccess(s.readings.second) && s.readings.second.value === 1).toBe(true)
    expect(s.readings.readsAfterSecond).toBeGreaterThan(1)
  }

  scenario(
    'A value that is already stale when first shown is not fetched again until something asks for it',
    Gherkin.Do.pipe(
      Given('a stale-marked value that avoids refetching on show')('setup', () =>
        Effect.sync(() => {
          const cell = { reads: 0 }
          const source = Atom.make(Effect.sync(() => {
            cell.reads++
            return 1
          }))
          const quiet = source.pipe(Atom.swr({ staleTime: 0, revalidateOnMount: false }))
          const page = Registry.make()
          return { cell, page, quiet }
        })),
      When('it is shown, then explicitly refreshed')('readings', (s) =>
        Effect.sync(() => {
          const first = s.setup.page.get(s.setup.quiet)
          const readsAfterFirst = s.setup.cell.reads
          s.setup.page.refresh(s.setup.quiet)
          const second = s.setup.page.get(s.setup.quiet)
          const readsAfterSecond = s.setup.cell.reads
          return { first, readsAfterFirst, readsAfterSecond, second }
        })),
      Then('only the refresh fetches again')(assertStaleOnMountWaitsForAsk),
    ),
  )

  const assertFailedAndWaitingLeftAlone = (s: {
    readonly readings: {
      readonly failingRead: Result.Result<number, unknown>
      readonly waitingRead: Result.Result<number, unknown>
    }
  }): void => {
    expect(Result.isFailure(s.readings.failingRead)).toBe(true)
    expect(
      Result.isSuccess(s.readings.waitingRead) && s.readings.waitingRead.waiting && s.readings.waitingRead.value === 1,
    )
      .toBe(true)
  }

  scenario(
    'A value that failed and one that is still waiting are left alone',
    Gherkin.Do.pipe(
      Given('a failing cached value and a waiting one')('setup', () =>
        Effect.sync(() => {
          const failing = Atom.make(Effect.fail('down' as const)).pipe(Atom.swr({ staleTime: 100 }))
          const waiting = Atom.make(() => Result.success(1, { waiting: true })).pipe(Atom.swr({ staleTime: 100 }))
          const page = Registry.make()
          return { failing, page, waiting }
        })),
      When('both are read')('readings', (s) =>
        Effect.sync(() => {
          const failingRead = s.setup.page.get(s.setup.failing)
          const waitingRead = s.setup.page.get(s.setup.waiting)
          return { failingRead, waitingRead }
        })),
      Then('neither is retried')(assertFailedAndWaitingLeftAlone),
    ),
  )
  const assertFamilyMembersIndependent = (s: {
    readonly readings: { readonly bar: number; readonly foo: number }
  }): void => {
    expect(s.readings.foo).toBe(3)
    expect(s.readings.bar).toBe(3)
  }

  scenario(
    'Two items with different keys get their own independent values',
    Gherkin.Do.pipe(
      Given('a family keyed by name')('setup', () =>
        Effect.sync(() => {
          const lengthOfName = Atom.family((name: string) => Atom.make(name.length))
          const page = Registry.make()
          return { lengthOfName, page }
        })),
      When('two members are read')('readings', (s) =>
        Effect.sync(() => ({
          bar: s.setup.page.get(s.setup.lengthOfName('bar')),
          foo: s.setup.page.get(s.setup.lengthOfName('foo')),
        }))),
      Then('each has its own value')(assertFamilyMembersIndependent),
    ),
  )

  const assertSameMemberSameIdentity = (s: { readonly same: boolean }): void => {
    expect(s.same).toBe(true)
  }

  scenario(
    'Asking a family for the same member twice gives the very same member',
    Gherkin.Do.pipe(
      Given('a family of numbers')('setup', () =>
        Effect.sync(() => {
          const family = Atom.family((id: number) => Atom.make(id * 10))
          return { family }
        })),
      When('the same member is requested twice')(
        'same',
        (s) => Effect.sync(() => s.setup.family(1) === s.setup.family(1)),
      ),
      Then('both requests give the very same member')(assertSameMemberSameIdentity),
    ),
  )

  const assertSharedViewShowsEveryChange = (s: {
    readonly readings: { readonly first: unknown; readonly second: unknown }
  }): void => {
    expect(s.readings.first).toBe(5)
    expect(s.readings.second).toBe(9)
  }

  scenario(
    'A view backed by a shared reference shows every change as it happens',
    Gherkin.Do.pipe(
      Given('a view on a shared counter')('setup', () =>
        Effect.gen(function*() {
          const ref = yield* SubscriptionRef.make(0)
          const view = Atom.subscriptionRef(ref)
          const page = Registry.make()
          page.mount(view)
          return { page, ref, view }
        })),
      When('the counter moves to 5 then 9')('readings', (s) =>
        Effect.gen(function*() {
          yield* SubscriptionRef.set(s.setup.ref, 5)
          const first = s.setup.page.get(s.setup.view)
          yield* SubscriptionRef.set(s.setup.ref, 9)
          const second = s.setup.page.get(s.setup.view)
          return { first, second }
        })),
      Then('every change shows as it happens')(assertSharedViewShowsEveryChange),
    ),
  )

  const assertLiveViewFollowsBothWays = (s: {
    readonly readings: {
      readonly brokenBefore: unknown
      readonly effectBefore: unknown
      readonly effectWritten: unknown
      readonly functionBefore: unknown
      readonly viewBefore: unknown
      readonly viewChanged: unknown
      readonly viewWritten: unknown
    }
  }): void => {
    expect(s.readings.viewBefore).toBe(0)
    expect(Result.isResult(s.readings.effectBefore) && Result.isSuccess(s.readings.effectBefore)).toBe(true)
    expect(Result.isResult(s.readings.functionBefore) && Result.isSuccess(s.readings.functionBefore)).toBe(true)
    expect(Result.isResult(s.readings.brokenBefore) && Result.isFailure(s.readings.brokenBefore)).toBe(true)
    expect(s.readings.viewWritten).toBe(5)
    expect(Result.isResult(s.readings.effectWritten) && Result.isSuccess(s.readings.effectWritten)).toBe(true)
    expect(s.readings.viewChanged).toBe(9)
  }

  scenario(
    'A live view of a shared reference follows the reference both ways, and a view whose reference cannot start reports it',
    Gherkin.Do.pipe(
      Given('live, effect-built, function-built and broken views, all mounted')('setup', () =>
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
          return { brokenView, effectView, functionView, page, ref, view }
        })),
      When('writes flow both ways and the runtime settles')('readings', (s) =>
        Effect.gen(function*() {
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const viewBefore = s.setup.page.get(s.setup.view)
          const effectBefore = s.setup.page.get(s.setup.effectView)
          const functionBefore = s.setup.page.get(s.setup.functionView)
          const brokenBefore = s.setup.page.get(s.setup.brokenView)
          s.setup.page.set(s.setup.view, 5)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const viewWritten = s.setup.page.get(s.setup.view)
          s.setup.page.set(s.setup.effectView, 3)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const effectWritten = s.setup.page.get(s.setup.effectView)
          yield* SubscriptionRef.set(s.setup.ref, 9)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const viewChanged = s.setup.page.get(s.setup.view)
          return { brokenBefore, effectBefore, effectWritten, functionBefore, viewBefore, viewChanged, viewWritten }
        })),
      Then('the live views follow both ways and the broken one reports')(assertLiveViewFollowsBothWays),
    ),
  )
  const assertServicesRuntimeAnswers = (s: {
    readonly readings: {
      readonly addResult: Result.Result<unknown, unknown>
      readonly countResult: Result.Result<unknown, unknown>
      readonly curriedResult: Result.Result<unknown, unknown>
      readonly doubledResult: Result.Result<unknown, unknown>
      readonly feedResult: Result.Result<{ readonly done: boolean; readonly items: unknown }, unknown>
      readonly reactiveResult: Result.Result<unknown, unknown>
      readonly reactiveStreamResult: Result.Result<unknown, unknown>
      readonly refFunctionResult: Result.Result<unknown, unknown>
      readonly refResult: Result.Result<unknown, unknown>
      readonly streamedResult: Result.Result<unknown, unknown>
    }
  }): void => {
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
  }

  scenario(
    'A page with services computes values and runs tasks against those services',
    Gherkin.Do.pipe(
      Given('a page whose services provide a counter of 1')('setup', () =>
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
            add,
            count,
            curried,
            doubled,
            feed,
            page,
            reactive,
            reactiveStream,
            refFromFunction,
            refView,
            streamed,
          }
        })),
      When('every kind of value runs against those services')('readings', (s) =>
        Effect.gen(function*() {
          const countResult = s.setup.page.get(s.setup.count)
          const doubledResult = s.setup.page.get(s.setup.doubled)
          s.setup.page.set(s.setup.add, 4)
          const addResult = s.setup.page.get(s.setup.add)
          s.setup.page.set(s.setup.curried, 2)
          const curriedResult = s.setup.page.get(s.setup.curried)
          s.setup.page.set(s.setup.reactive, 4)
          const reactiveResult = s.setup.page.get(s.setup.reactive)
          s.setup.page.set(s.setup.reactiveStream, 3)
          const reactiveStreamResult = s.setup.page.get(s.setup.reactiveStream)
          s.setup.page.mount(s.setup.feed)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          s.setup.page.set(s.setup.feed, void 0)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const feedResult = s.setup.page.get(s.setup.feed)
          s.setup.page.mount(s.setup.streamed)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const streamedResult = s.setup.page.get(s.setup.streamed)
          s.setup.page.mount(s.setup.refView)
          s.setup.page.mount(s.setup.refFromFunction)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const refResult = s.setup.page.get(s.setup.refView)
          const refFunctionResult = s.setup.page.get(s.setup.refFromFunction)
          return {
            addResult,
            countResult,
            curriedResult,
            doubledResult,
            feedResult,
            reactiveResult,
            reactiveStreamResult,
            refFunctionResult,
            refResult,
            streamedResult,
          }
        })),
      Then('every value answers against those services')(assertServicesRuntimeAnswers),
    ),
  )

  const assertRecipeRuntimeAnswers = (s: {
    readonly reading: Result.Result<unknown, unknown>
  }): void => {
    expect(Result.isSuccess(s.reading) && s.reading.value === 7).toBe(true)
  }

  scenario(
    'A page whose services are built from a recipe answers with the recipe result',
    Gherkin.Do.pipe(
      Given('a page whose services come from a recipe answering 7')('setup', () =>
        Effect.sync(() => {
          const Counter = Context.Service<number>('Atom.feature.test/CounterFromRecipe')
          const recipeRuntime = Atom.context()((_get) => Layer.sync(Counter, () => 7))
          const count = recipeRuntime.atom(Counter.use((n) => Effect.succeed(n)))
          const page = Registry.make()
          return { count, page }
        })),
      When('the value is read')('reading', (s) => Effect.sync(() => s.setup.page.get(s.setup.count))),
      Then('it answers 7')(assertRecipeRuntimeAnswers),
    ),
  )

  const assertBrokenRuntimeReportsUnavailable = (s: {
    readonly readings: {
      readonly addRead: Result.Result<unknown, unknown>
      readonly countRead: Result.Result<unknown, unknown>
      readonly feedRead: Result.Result<unknown, unknown>
      readonly refRead: Result.Result<unknown, unknown>
    }
  }): void => {
    expect(Result.isFailure(s.readings.countRead)).toBe(true)
    expect(Result.isFailure(s.readings.addRead)).toBe(true)
    expect(Result.isFailure(s.readings.feedRead)).toBe(true)
    expect(Result.isFailure(s.readings.refRead)).toBe(true)
  }

  scenario(
    'A page whose services fail reports that every value is unavailable',
    Gherkin.Do.pipe(
      Given('a page whose services fail to build')('setup', () =>
        Effect.sync(() => {
          const brokenRuntime = Atom.context()(Layer.effectDiscard(Effect.fail('boom' as const)))
          const count = brokenRuntime.atom(Effect.succeed(1))
          const add = brokenRuntime.fn((n: number) => Effect.succeed(n))
          const feed = brokenRuntime.pull(Stream.make(1))
          const refView = brokenRuntime.subscriptionRef(SubscriptionRef.make(0))
          const page = Registry.make()
          return { add, count, feed, page, refView }
        })),
      When('every kind of value is read')('readings', (s) =>
        Effect.sync(() => ({
          addRead: s.setup.page.get(s.setup.add),
          countRead: s.setup.page.get(s.setup.count),
          feedRead: s.setup.page.get(s.setup.feed),
          refRead: s.setup.page.get(s.setup.refView),
        }))),
      Then('each reports unavailability')(assertBrokenRuntimeReportsUnavailable),
    ),
  )
  const assertSeededPageStartsFilled = (s: {
    readonly readings: { readonly afterWrite: number; readonly seeded: number }
  }): void => {
    expect(s.readings.seeded).toBe(10)
    expect(s.readings.afterWrite).toBe(5)
  }

  scenario(
    'A saved value starts a fresh page already filled in',
    Gherkin.Do.pipe(
      Given('a fresh page seeded with a saved count of 10')('setup', () =>
        Effect.sync(() => {
          const count = Atom.make(0).pipe(Atom.serializable({ key: 'count', schema: Schema.Number }))
          const page = Registry.make({ initialValues: [Atom.initialValue(count, 10)] })
          return { count, page }
        })),
      When('it is read, then set to 5')('readings', (s) =>
        Effect.sync(() => {
          const seeded = s.setup.page.get(s.setup.count)
          s.setup.page.set(s.setup.count, 5)
          return { afterWrite: s.setup.page.get(s.setup.count), seeded }
        })),
      Then('the seed shows first, then the write')(assertSeededPageStartsFilled),
    ),
  )

  const assertLateArrivalUpdatesInPlace = (s: { readonly reading: number }): void => {
    expect(s.reading).toBe(42)
  }

  scenario(
    'A saved value arriving while the page already shows the value updates it in place',
    Gherkin.Do.pipe(
      Given('a page already showing zero')('setup', () =>
        Effect.sync(() => {
          const count = Atom.make(0).pipe(Atom.serializable({ key: 'count', schema: Schema.Number }))
          const page = Registry.make()
          return { count, page }
        })),
      When('a saved count of 42 arrives, then the value is read')('reading', (s) =>
        Effect.sync(() => {
          s.setup.page.get(s.setup.count)
          s.setup.page.setSerializable('count', 42)
          return s.setup.page.get(s.setup.count)
        })),
      Then('it updates in place')(assertLateArrivalUpdatesInPlace),
    ),
  )

  const assertEarlyArrivalAppliesOnRead = (s: { readonly reading: number }): void => {
    expect(s.reading).toBe(42)
  }

  scenario(
    'A saved value arriving before the page asks for it is applied when it does',
    Gherkin.Do.pipe(
      Given('a page that has not shown the count yet')('setup', () =>
        Effect.sync(() => {
          const count = Atom.make(0).pipe(Atom.serializable({ key: 'count', schema: Schema.Number }))
          const page = Registry.make()
          return { count, page }
        })),
      When('the saved value arrives first, then the count is read')('reading', (s) =>
        Effect.sync(() => {
          s.setup.page.setSerializable('count', 42)
          return s.setup.page.get(s.setup.count)
        })),
      Then('the saved value applies')(assertEarlyArrivalAppliesOnRead),
    ),
  )

  const assertDerivedRestoreUntilRefresh = (s: {
    readonly readings: { readonly restored: number; readonly refreshed: number }
  }): void => {
    try {
      expect(s.readings.restored).toBe(99)
      expect(s.readings.refreshed).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  }

  scenario(
    'A saved derived value restores the value it was derived from, until the derived value refreshes',
    Gherkin.Do.pipe(
      Given('a mounted saved derived value with the clock held')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const base = Atom.make(0)
          const derived = base.pipe(Atom.withRefresh(1000))
          const saved = derived.pipe(Atom.serializable({ key: 'derived', schema: Schema.Number }))
          const page = Registry.make()
          const unmount = page.mount(saved)
          return { page, saved, unmount }
        })),
      When('the saved value arrives, then the refresh window passes')('readings', (s) =>
        Effect.sync(() => {
          s.setup.page.setSerializable('derived', 99)
          const restored = s.setup.page.get(s.setup.saved)
          vi.advanceTimersByTime(2000)
          const refreshed = s.setup.page.get(s.setup.saved)
          s.setup.unmount()
          return { refreshed, restored }
        })),
      Then('the restore shows first, then the live value returns')(assertDerivedRestoreUntilRefresh),
    ),
  )

  const assertNamedValueKeepsName = (
    s: { readonly readings: { readonly label: unknown; readonly value: number } },
  ): void => {
    expect(s.readings.value).toBe(0)
    expect(s.readings.label).toBe('my-count')
  }

  scenario(
    'A saved value keeps its own name when given one',
    Gherkin.Do.pipe(
      Given('a mounted named saved value')('setup', () =>
        Effect.sync(() => {
          const named = Atom.make(0).pipe(
            Atom.withLabel('my-count'),
            Atom.serializable({ key: 'named', schema: Schema.Number }),
          )
          const page = Registry.make()
          page.mount(named)
          return { named, page }
        })),
      When('it is read')('readings', (s) =>
        Effect.sync(() => ({
          label: s.setup.named.label?.[0],
          value: s.setup.page.get(s.setup.named),
        }))),
      Then('it shows zero and keeps its own name')(assertNamedValueKeepsName),
    ),
  )

  const assertServerRecipesServe = (s: {
    readonly readings: {
      readonly local: number
      readonly nested: number
      readonly notYetLoaded: Result.Result<unknown, unknown>
      readonly overridden: number
    }
  }): void => {
    expect(s.readings.local).toBe(5)
    expect(s.readings.overridden).toBe(7)
    expect(s.readings.nested).toBe(15)
    expect(Result.isInitial(s.readings.notYetLoaded) && s.readings.notYetLoaded.waiting).toBe(true)
  }

  scenario(
    'A page serves its values to the server, using each value’s own server recipe',
    Gherkin.Do.pipe(
      Given('a page with a plain value set to 5, an overridden one, a nested one, and one not yet loaded')(
        'setup',
        () =>
          Effect.sync(() => {
            const local = Atom.make(0)
            const overridden = Atom.make(1).pipe(Atom.withServerValue(() => 7))
            const nested = Atom.make((get) => get(local) * 2).pipe(Atom.withServerValue((get) => get(local) * 3))
            const notYetLoaded = Atom.make(Effect.succeed(3)).pipe(Atom.withServerValueInitial)
            const page = Registry.make()
            page.set(local, 5)
            return { local, nested, notYetLoaded, overridden, page }
          }),
      ),
      When('each server recipe is read')('readings', (s) =>
        Effect.sync(() => ({
          local: Atom.getServerValue(s.setup.local, s.setup.page),
          nested: Atom.getServerValue(s.setup.nested, s.setup.page),
          notYetLoaded: Atom.getServerValue(s.setup.notYetLoaded, s.setup.page),
          overridden: Atom.getServerValue(s.setup.overridden, s.setup.page),
        }))),
      Then('each value serves through its own recipe')(assertServerRecipesServe),
    ),
  )
  const assertRememberedSurvivesFreshPage = (s: { readonly onFreshPage: number }): void => {
    expect(s.onFreshPage).toBe(42)
  }

  scenario(
    'A value remembered in the store is still there on a fresh page',
    Gherkin.Do.pipe(
      Given('a remembered count in a shared store')('setup', () =>
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
          return { page, remembered }
        })),
      When('it is set to 42 and a fresh page opens it')('onFreshPage', (s) =>
        Effect.gen(function*() {
          s.setup.page.mount(s.setup.remembered)
          yield* Effect.yieldNow
          s.setup.page.set(s.setup.remembered, 42)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const freshPage = Registry.make()
          freshPage.mount(s.setup.remembered)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          return freshPage.get(s.setup.remembered)
        })),
      Then('the fresh page shows 42')(assertRememberedSurvivesFreshPage),
    ),
  )

  const assertNoAddressBarReadsEmpty = (s: {
    readonly readings: { readonly decoded: Option.Option<number>; readonly plain: string; readonly written: string }
  }): void => {
    expect(s.readings.plain).toBe('')
    expect(Option.isNone(s.readings.decoded)).toBe(true)
    expect(s.readings.written).toBe('hello')
  }

  scenario(
    'A value remembered in the page address reads as empty when there is no address bar',
    Gherkin.Do.pipe(
      Given('a page with no address bar')('setup', () =>
        Effect.sync(() => {
          const plain = Atom.searchParam('q')
          const decoded = Atom.searchParam('n', { schema: Schema.NumberFromString })
          const page = Registry.make()
          return { decoded, page, plain }
        })),
      When('two address-backed values are read and one is written')('readings', (s) =>
        Effect.sync(() => {
          const plain = s.setup.page.get(s.setup.plain)
          const decoded = s.setup.page.get(s.setup.decoded)
          s.setup.page.set(s.setup.plain, 'hello')
          const written = s.setup.page.get(s.setup.plain)
          return { decoded, plain, written }
        })),
      Then('the missing address reads empty and the write lands')(assertNoAddressBarReadsEmpty),
    ),
  )

  const assertSlowStoreFallbackThenAnswers = (s: {
    readonly readings: { readonly loaded: number; readonly stored: unknown; readonly whileLoading: number }
  }): void => {
    expect(s.readings.whileLoading).toBe(0)
    expect(s.readings.loaded).toBe(42)
    expect(s.readings.stored).toBe(JSON.stringify(42))
  }

  scenario(
    'A value remembered in a slower store shows the fallback until the store answers, without overwriting the store',
    Gherkin.Do.pipe(
      Given('a remembered value behind a slow store holding 42, with a zero fallback')(
        'setup',
        () =>
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
          }),
      ),
      When('it is read, then the store answers')('readings', (s) =>
        Effect.gen(function*() {
          const whileLoading = s.setup.page.get(s.setup.remembered)
          yield* Deferred.succeed(s.setup.gate, void 0)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const loaded = s.setup.page.get(s.setup.remembered)
          const stored = s.setup.storage.get('known-key')
          return { loaded, stored, whileLoading }
        })),
      Then('the fallback shows first, the store wins after, and the store keeps its bytes')(
        assertSlowStoreFallbackThenAnswers,
      ),
    ),
  )

  const assertEarlyWriteWinsOverSlowRead = (s: { readonly value: number }): void => {
    expect(s.value).toBe(99)
  }

  scenario(
    'A write made before the store answers wins over the slower store read',
    Gherkin.Do.pipe(
      Given('a remembered value behind a gated store holding 42')('setup', () =>
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
      When('99 is written before the store answers')('value', (s) =>
        Effect.gen(function*() {
          s.setup.page.set(s.setup.remembered, 99)
          yield* Deferred.succeed(s.setup.gate, void 0)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          return s.setup.page.get(s.setup.remembered)
        })),
      Then('the write wins')(assertEarlyWriteWinsOverSlowRead),
    ),
  )

  const assertAsyncModeLoadingThenWrite = (s: {
    readonly readings: {
      readonly afterWrite: Result.Result<number, unknown>
      readonly loaded: Result.Result<number, unknown>
      readonly stored: unknown
      readonly whileLoading: Result.Result<number, unknown>
    }
  }): void => {
    expect(Result.isInitial(s.readings.whileLoading)).toBe(true)
    expect(Result.isSuccess(s.readings.loaded) && s.readings.loaded.value === 0).toBe(true)
    expect(Result.isSuccess(s.readings.afterWrite) && s.readings.afterWrite.value === 99).toBe(true)
    expect(s.readings.stored).toBe(JSON.stringify(99))
  }

  scenario(
    'A value remembered in loading mode exposes its loading state and accepts writes',
    Gherkin.Do.pipe(
      Given('a remembered value in loading mode behind a gated store')('setup', () =>
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
        })),
      When('it loads, then 99 is written')('readings', (s) =>
        Effect.gen(function*() {
          const whileLoading = s.setup.page.get(s.setup.remembered)
          yield* Deferred.succeed(s.setup.gate, void 0)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const loaded = s.setup.page.get(s.setup.remembered)
          s.setup.page.set(s.setup.remembered, 99)
          const afterWrite = s.setup.page.get(s.setup.remembered)
          const stored = s.setup.storage.get('fresh-key')
          return { afterWrite, loaded, stored, whileLoading }
        })),
      Then('loading shows first, then the write lands in the store')(assertAsyncModeLoadingThenWrite),
    ),
  )
  const assertFeedArrivesInOrder = (s: {
    readonly final: Result.Result<{ readonly done: boolean; readonly items: Iterable<unknown> }, unknown>
  }): void => {
    expect(Result.isSuccess(s.final)).toBe(true)
    if (Result.isSuccess(s.final)) {
      expect(s.final.value.done).toBe(true)
      expect([...s.final.value.items]).toEqual([1, 2, 3])
    }
  }

  scenario(
    'A reader following a feed sees every update arrive in order',
    Gherkin.Do.pipe(
      Given('a mounted feed of three items')('setup', () =>
        Effect.sync(() => {
          const feed = Atom.pull(Stream.make(1, 2, 3))
          const page = Registry.make()
          page.mount(feed)
          return { feed, page }
        })),
      When('each batch is pulled in turn')('final', (s) =>
        Effect.gen(function*() {
          s.setup.page.set(s.setup.feed, void 0)
          yield* Effect.yieldNow
          s.setup.page.set(s.setup.feed, void 0)
          yield* Effect.yieldNow
          s.setup.page.set(s.setup.feed, void 0)
          yield* Effect.yieldNow
          s.setup.page.set(s.setup.feed, void 0)
          yield* Effect.yieldNow
          return s.setup.page.get(s.setup.feed)
        })),
      Then('every update arrives in order')(assertFeedArrivesInOrder),
    ),
  )

  const assertBatchedFeedKeepsNewest = (s: {
    readonly result: Result.Result<{ readonly done: boolean; readonly items: Iterable<unknown> }, unknown>
  }): void => {
    expect(Result.isSuccess(s.result)).toBe(true)
    if (Result.isSuccess(s.result)) {
      expect(s.result.value.done).toBe(false)
      expect([...s.result.value.items]).toEqual([3, 4])
    }
  }

  scenario(
    'A feed pulled in batches keeps only the newest batch when asked to',
    Gherkin.Do.pipe(
      Given('a mounted feed that keeps only the newest batch')('setup', () =>
        Effect.sync(() => {
          const feed = Atom.pull(Stream.make(1, 2).pipe(Stream.concat(Stream.make(3, 4))), {
            disableAccumulation: true,
          })
          const page = Registry.make()
          page.mount(feed)
          return { feed, page }
        })),
      When('the runtime settles and the next batch is pulled')('result', (s) =>
        Effect.gen(function*() {
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          s.setup.page.set(s.setup.feed, void 0)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          return s.setup.page.get(s.setup.feed)
        })),
      Then('only the newest batch remains, still open')(assertBatchedFeedKeepsNewest),
    ),
  )

  const assertDryFeedReportsNothingMore = (s: { readonly result: Result.Result<unknown, unknown> }): void => {
    expect(Result.isFailure(s.result)).toBe(true)
  }

  scenario(
    'A feed that runs dry reports that it had nothing more to show',
    Gherkin.Do.pipe(
      Given('a mounted feed with nothing to show')('setup', () =>
        Effect.sync(() => {
          const feed = Atom.pull(Stream.empty)
          const page = Registry.make()
          page.mount(feed)
          return { feed, page }
        })),
      When('the runtime settles')('result', (s) =>
        Effect.gen(function*() {
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          return s.setup.page.get(s.setup.feed)
        })),
      Then('it reports having nothing more')(assertDryFeedReportsNothingMore),
    ),
  )

  const assertFailingFeedReportsFailure = (s: { readonly result: Result.Result<unknown, unknown> }): void => {
    expect(Result.isFailure(s.result)).toBe(true)
  }

  scenario(
    'A feed that fails reports the failure',
    Gherkin.Do.pipe(
      Given('a mounted feed that fails')('setup', () =>
        Effect.sync(() => {
          const feed = Atom.pull(Stream.fail('boom' as const))
          const page = Registry.make()
          page.mount(feed)
          return { feed, page }
        })),
      When('the runtime settles')('result', (s) =>
        Effect.gen(function*() {
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          return s.setup.page.get(s.setup.feed)
        })),
      Then('it reports the failure')(assertFailingFeedReportsFailure),
    ),
  )

  const assertConcurrentPullsArriveTogether = (s: {
    readonly result: Result.Result<{ readonly done: boolean; readonly items: Iterable<unknown> }, unknown>
  }): void => {
    expect(Result.isSuccess(s.result)).toBe(true)
    if (Result.isSuccess(s.result)) {
      expect(s.result.value.done).toBe(false)
      expect([...s.result.value.items]).toEqual([7, 7, 7])
    }
  }

  scenario(
    'Two requests for the next batch at the same time both arrive once the signal comes',
    Gherkin.Do.pipe(
      Given('a mounted repeating feed behind a gate, asked twice at once')('setup', () =>
        Effect.sync(() => {
          const gate = Deferred.makeUnsafe<number>()
          const feed = Atom.pull(() => Stream.fromEffectRepeat(Deferred.await(gate).pipe(Effect.as(7))))
          const page = Registry.make()
          page.mount(feed)
          return { feed, gate, page }
        })),
      When('the signal arrives and the runtime settles')('result', (s) =>
        Effect.gen(function*() {
          s.setup.page.set(s.setup.feed, void 0)
          s.setup.page.set(s.setup.feed, void 0)
          yield* Deferred.succeed(s.setup.gate, 7)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          return s.setup.page.get(s.setup.feed)
        })),
      Then('both requests arrive together')(assertConcurrentPullsArriveTogether),
    ),
  )
  const assertDerivedNotifiesOnOwnChange = (s: { readonly notifications: ReadonlyArray<boolean> }): void => {
    expect(s.notifications).toEqual([true])
  }

  scenario(
    'A derived read-only value only notifies when its own computed value actually changes',
    Gherkin.Do.pipe(
      Given('a counter with a derived over-five view and a listener')('setup', () =>
        Effect.sync(() => {
          const count = AtomRef.make(0)
          const isOverFive = count.map((n) => n > 5)
          const notifications: boolean[] = []
          const cancel = isOverFive.subscribe((v) => notifications.push(v))
          return { cancel, count, notifications }
        })),
      When('the counter moves 1, 2, 3, then 6')('notifications', (s) =>
        Effect.sync(() => {
          s.setup.count.set(1)
          s.setup.count.set(2)
          s.setup.count.set(3)
          s.setup.count.set(6)
          s.setup.cancel()
          return [...s.setup.notifications]
        })),
      Then('only the crossing notifies')(assertDerivedNotifiesOnOwnChange),
    ),
  )

  const assertListPropSetIsolated = (s: { readonly list: ReadonlyArray<number> }): void => {
    expect(s.list).toEqual([10, 99, 30])
  }

  scenario(
    'Editing one item in a list of shared items does not affect the others',
    Gherkin.Do.pipe(
      Given('a shared list of three numbers')('setup', () =>
        Effect.sync(() => {
          const list = AtomRef.make([10, 20, 30])
          const middleItem = list.prop(1)
          return { list, middleItem }
        })),
      When('the middle item is set to 99')('list', (s) =>
        Effect.sync(() => {
          s.setup.middleItem.set(99)
          return [...s.setup.list.value]
        })),
      Then('only the middle changes')(assertListPropSetIsolated),
    ),
  )

  const assertRemovedItemGoesQuiet = (s: {
    readonly readings: { readonly afterRemoval: ReadonlyArray<number>; readonly stayedQuiet: boolean }
  }): void => {
    expect(s.readings.afterRemoval).toEqual([1, 3])
    expect(s.readings.stayedQuiet).toBe(true)
  }

  scenario(
    'Removing an item from a shared collection stops it from affecting the collection, and the remaining items are unchanged',
    Gherkin.Do.pipe(
      Given('a shared collection of three with a listener')('setup', () =>
        Effect.sync(() => {
          const items = AtomRef.collection([1, 2, 3])
          const cell = { notifications: 0 }
          const cancel = items.subscribe(() => {
            cell.notifications++
          })
          return { cancel, cell, items }
        })),
      When('the middle item is removed, then edited')('readings', (s) =>
        Effect.sync(() => {
          const removed = s.setup.items.value[1]
          s.setup.items.remove(removed)
          const afterRemoveNotifications = s.setup.cell.notifications
          removed.set(999)
          const afterStaleEditNotifications = s.setup.cell.notifications
          s.setup.cancel()
          return {
            afterRemoval: [...s.setup.items.toArray()],
            stayedQuiet: afterStaleEditNotifications === afterRemoveNotifications,
          }
        })),
      Then('the collection drops it and stays quiet')(assertRemovedItemGoesQuiet),
    ),
  )

  const assertMiddleListenerLeaves = (s: {
    readonly readings: {
      readonly first: ReadonlyArray<number>
      readonly second: ReadonlyArray<number>
      readonly third: ReadonlyArray<number>
    }
  }): void => {
    expect(s.readings.first).toEqual([1])
    expect(s.readings.second).toEqual([])
    expect(s.readings.third).toEqual([1])
  }

  scenario(
    'A listener that leaves the middle of the chain stops hearing, while the others keep hearing',
    Gherkin.Do.pipe(
      Given('a shared value with three listeners')('setup', () =>
        Effect.sync(() => {
          const value = AtomRef.make(0)
          const first: number[] = []
          const second: number[] = []
          const third: number[] = []
          value.subscribe((v) => first.push(v))
          const cancelSecond = value.subscribe((v) => second.push(v))
          value.subscribe((v) => third.push(v))
          return { cancelSecond, first, second, third, value }
        })),
      When('the middle listener leaves, then the value changes')('readings', (s) =>
        Effect.sync(() => {
          s.setup.cancelSecond()
          s.setup.value.set(1)
          return { first: [...s.setup.first], second: [...s.setup.second], third: [...s.setup.third] }
        })),
      Then('only the remaining two hear it')(assertMiddleListenerLeaves),
    ),
  )

  const assertLateKeyStaysQuiet = (s: { readonly heard: ReadonlyArray<string | undefined> }): void => {
    expect(s.heard).toEqual(['arrived'])
  }

  scenario(
    'A view into a key that only appears later stays quiet until the key exists',
    Gherkin.Do.pipe(
      Given('a shared record missing a name with a listener on the name')('setup', () =>
        Effect.sync(() => {
          const record = AtomRef.make<{ name?: string; other?: string }>({ other: 'o' })
          const name = record.prop('name')
          const heard: (string | undefined)[] = []
          name.subscribe((v) => heard.push(v))
          return { heard, name, record }
        })),
      When('an unrelated write lands, then the name arrives')('heard', (s) =>
        Effect.sync(() => {
          s.setup.record.set({ other: 'changed' })
          s.setup.record.set({ other: 'changed', name: 'arrived' })
          return [...s.setup.heard]
        })),
      Then('only the arrival is heard')(assertLateKeyStaysQuiet),
    ),
  )

  const assertListUpdateIsolated = (s: { readonly list: ReadonlyArray<number> }): void => {
    expect(s.list).toEqual([10, 21, 30])
  }

  scenario(
    'Updating one item in a list with a function changes just that item',
    Gherkin.Do.pipe(
      Given('a shared list of three numbers with a view on the middle')('setup', () =>
        Effect.sync(() => {
          const list = AtomRef.make([10, 20, 30])
          const middleItem = list.prop(1)
          return { list, middleItem }
        })),
      When('the middle item is updated by function')('list', (s) =>
        Effect.sync(() => {
          s.setup.middleItem.update((n) => n + 1)
          return [...s.setup.list.value]
        })),
      Then('only that item changes')(assertListUpdateIsolated),
    ),
  )
  const assertStrangerRemovalNoop = (s: {
    readonly readings: { readonly heard: number; readonly remaining: ReadonlyArray<number> }
  }): void => {
    expect(s.readings.remaining).toEqual([1, 2, 3])
    expect(s.readings.heard).toBe(0)
  }

  scenario(
    'Removing an item that is not in the collection leaves the collection untouched',
    Gherkin.Do.pipe(
      Given('a shared collection of three with a listener, plus an outsider item')('setup', () =>
        Effect.sync(() => {
          const items = AtomRef.collection([1, 2, 3])
          const stranger = AtomRef.collection([9]).value[0]
          const cell = { notifications: 0 }
          const cancel = items.subscribe(() => {
            cell.notifications++
          })
          return { cancel, cell, items, stranger }
        })),
      When('the outsider item is removed')('readings', (s) =>
        Effect.sync(() => {
          s.setup.items.remove(s.setup.stranger)
          const remaining = [...s.setup.items.toArray()]
          const heard = s.setup.cell.notifications
          s.setup.cancel()
          return { heard, remaining }
        })),
      Then('nothing changes and nothing fires')(assertStrangerRemovalNoop),
    ),
  )

  const assertRecordFieldUpdateIsolated = (
    s: { readonly record: { readonly name: string; readonly other: string } },
  ): void => {
    expect(s.record).toEqual({ name: 'ADA', other: 'x' })
  }

  scenario(
    'Updating one field of a shared record with a function changes just that field',
    Gherkin.Do.pipe(
      Given('a shared record')('setup', () =>
        Effect.sync(() => {
          const record = AtomRef.make({ name: 'ada', other: 'x' })
          const name = record.prop('name')
          return { name, record }
        })),
      When('the name field is updated by function')('record', (s) =>
        Effect.sync(() => {
          s.setup.name.update((n) => n.toUpperCase())
          return { ...s.setup.record.value }
        })),
      Then('only that field changes')(assertRecordFieldUpdateIsolated),
    ),
  )

  const assertNestedCollectionSync = (s: {
    readonly readings: {
      readonly afterFieldCity: string
      readonly afterFieldNotifications: number
      readonly afterNestedItems: ReadonlyArray<{ readonly address: { readonly city: string }; readonly name: string }>
      readonly afterNestedNotifications: number
      readonly afterRemovalItems: ReadonlyArray<{ readonly address: { readonly city: string }; readonly name: string }>
      readonly afterRemovalNotifications: number
    }
  }): void => {
    expect(s.readings.afterFieldNotifications).toBe(1)
    expect(s.readings.afterFieldCity).toBe('london')
    expect(s.readings.afterNestedNotifications).toBe(2)
    expect(s.readings.afterNestedItems).toEqual([
      { name: 'bob', address: { city: 'LONDON' } },
      { name: 'grace', address: { city: 'paris' } },
    ])
    expect(s.readings.afterRemovalNotifications).toBe(3)
    expect(s.readings.afterRemovalItems).toEqual([{ name: 'grace', address: { city: 'paris' } }])
  }

  scenario(
    'A nested view into an item of a shared collection keeps the collection in sync while the item changes, and goes quiet once the item is removed',
    Gherkin.Do.pipe(
      Given('a shared collection of records with a listener')('setup', () =>
        Effect.sync(() => {
          const items = AtomRef.collection([
            { name: 'ada', address: { city: 'london' } },
            { name: 'grace', address: { city: 'paris' } },
          ])
          const firstName = items.value[0].prop('name')
          const city = items.value[0].prop('address').prop('city')
          const cell = { notifications: 0 }
          const cancel = items.subscribe(() => {
            cell.notifications++
          })
          return { cancel, cell, city, firstName, items }
        })),
      When('a field changes, a nested field updates, then the item is removed and edited')(
        'readings',
        (s) =>
          Effect.sync(() => {
            s.setup.firstName.set('bob')
            const afterFieldNotifications = s.setup.cell.notifications
            const afterFieldCity = s.setup.city.value
            s.setup.city.update((c) => c.toUpperCase())
            const afterNestedNotifications = s.setup.cell.notifications
            const afterNestedItems = s.setup.items.toArray().map((item) => ({ ...item }))
            const removed = s.setup.items.value[0]
            s.setup.items.remove(removed)
            removed.prop('name').set('zed')
            const afterRemovalNotifications = s.setup.cell.notifications
            const afterRemovalItems = s.setup.items.toArray().map((item) => ({ ...item }))
            s.setup.cancel()
            return {
              afterFieldCity,
              afterFieldNotifications,
              afterNestedItems,
              afterNestedNotifications,
              afterRemovalItems,
              afterRemovalNotifications,
            }
          }),
      ),
      Then('the collection tracks changes, then goes quiet after removal')(assertNestedCollectionSync),
    ),
  )

  const assertSameValueStaysQuiet = (s: {
    readonly readings: { readonly heard: ReadonlyArray<number>; readonly sameRef: boolean }
  }): void => {
    expect(s.readings.heard).toEqual([6])
    expect(s.readings.sameRef).toBe(true)
  }

  scenario(
    'Setting a shared value to what it already holds leaves its listeners quiet',
    Gherkin.Do.pipe(
      Given('a shared value of 5 with a listener')('setup', () =>
        Effect.sync(() => {
          const value = AtomRef.make(5)
          const heard: number[] = []
          value.subscribe((v) => heard.push(v))
          return { heard, value }
        })),
      When('it is set to 5, then 6')('readings', (s) =>
        Effect.sync(() => {
          const sameRef = s.setup.value.set(5)
          s.setup.value.set(6)
          return { heard: [...s.setup.heard], sameRef: sameRef === s.setup.value }
        })),
      Then('only the real change notifies')(assertSameValueStaysQuiet),
    ),
  )

  const assertLateFieldAppearsAndFollowed = (s: {
    readonly readings: {
      readonly afterAppearing: string | undefined
      readonly current: string | undefined
      readonly heard: ReadonlyArray<string | undefined>
    }
  }): void => {
    expect(s.readings.heard).toEqual(['ada', 'bob'])
    expect(s.readings.afterAppearing).toBe('ada')
    expect(s.readings.current).toBe('bob')
  }

  scenario(
    'A view into a field that appears later reflects the field once it exists, and keeps following it',
    Gherkin.Do.pipe(
      Given('a shared record missing a name with a listener on it')('setup', () =>
        Effect.sync(() => {
          const record = AtomRef.make<{ name?: string; other?: string }>({ other: 'x' })
          const name = record.prop('name')
          const heard: (string | undefined)[] = []
          name.subscribe((v) => heard.push(v))
          return { heard, name, record }
        })),
      When('the name appears, then changes')('readings', (s) =>
        Effect.sync(() => {
          s.setup.record.update((r) => ({ ...r, name: 'ada' }))
          const afterAppearing = s.setup.name.value
          s.setup.record.update((r) => ({ ...r, name: 'bob' }))
          const current = s.setup.name.value
          return { afterAppearing, current, heard: [...s.setup.heard] }
        })),
      Then('both are heard and the view follows')(assertLateFieldAppearsAndFollowed),
    ),
  )

  const assertWatchedFieldOnlyHeard = (s: {
    readonly readings: { readonly afterUnrelated: ReadonlyArray<string>; readonly heard: ReadonlyArray<string> }
  }): void => {
    expect(s.readings.afterUnrelated).toEqual([])
    expect(s.readings.heard).toEqual(['bob'])
  }

  scenario(
    'A view into one field of a shared record stays quiet while other fields change around it',
    Gherkin.Do.pipe(
      Given('a shared record with a listener on one field')('setup', () =>
        Effect.sync(() => {
          const record = AtomRef.make({ name: 'ada', other: 'x' })
          const name = record.prop('name')
          const heard: string[] = []
          name.subscribe((v) => heard.push(v))
          return { heard, name, record }
        })),
      When('another field changes, then the watched field changes')('readings', (s) =>
        Effect.sync(() => {
          s.setup.record.set({ name: 'ada', other: 'y' })
          const afterUnrelated = [...s.setup.heard]
          s.setup.record.set({ name: 'bob', other: 'y' })
          return { afterUnrelated, heard: [...s.setup.heard] }
        })),
      Then('only the watched change is heard')(assertWatchedFieldOnlyHeard),
    ),
  )
})
