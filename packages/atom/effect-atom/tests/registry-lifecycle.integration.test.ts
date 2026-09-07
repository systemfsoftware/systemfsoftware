/**
 * A page keeps exactly the shared values its readers still need, sweeping the rest.
 *
 * Exercises the published Atom / Registry surface end to end: loading and
 * derived values, settled reads, subscriptions and streams, idle expiry,
 * mounting and disposal, batching, initial and serializable preloads,
 * laziness, and invalidation. One scenario per behavior below.
 */
import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as Registry from '@systemfsoftware/effect-atom/Registry'
import * as Result from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Effect, Exit, Fiber, HashSet, Latch, Match, Option, Schema, Stream } from 'effect'
import { expect, vi } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('A page keeps exactly the shared values its readers still need, sweeping the rest').body(({ scenario }) => {
  scenario(
    'Loading values — readers checking during cleanup still see a loading value',
    Gherkin.Do.pipe(
      Given('a loading value had been read twice on a fresh page')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          let startCount = 0
          const atom = Atom.make(
            Effect.callback<number>(() => {
              startCount++
            }),
          )
          const page = Registry.make({ defaultIdleTTL: 10 })
          const firstReading = page.get(atom)
          const secondReading = page.get(atom)
          return { atom, page, firstReading, secondReading, started: () => startCount }
        })),
      When('the value is read again after the cleanup window passes')('outcome', (s) =>
        Effect.sync(() => {
          vi.advanceTimersByTime(100)
          const readingAfterCleanup = s.setup.page.get(s.setup.atom)
          return { readingAfterCleanup, started: s.setup.started() }
        })),
      Then('every read still shows a loading value built only once')((s) => {
        try {
          expect(s.outcome.started).toBe(1)
          expect(Result.isInitial(s.setup.firstReading)).toBe(true)
          expect(Result.isInitial(s.setup.secondReading)).toBe(true)
          expect(Result.isInitial(s.outcome.readingAfterCleanup)).toBe(true)
        } finally {
          vi.useRealTimers()
        }
      }),
    ),
  )

  scenario(
    'Loading values — a value kept alive is built once across cleanup windows',
    Gherkin.Do.pipe(
      Given('a kept-alive loading value had been read on a short-lived page')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          let startCount = 0
          const atom = Atom.keepAlive(
            Atom.make(Effect.callback(() => {
              startCount++
            })),
          )
          const page = Registry.make({ defaultIdleTTL: 5 })
          page.get(atom)
          return { atom, page, started: () => startCount }
        })),
      When('the cleanup window passes and the value is read again')('outcome', (s) =>
        Effect.sync(() => {
          vi.advanceTimersByTime(100)
          s.setup.page.get(s.setup.atom)
          return { started: s.setup.started() }
        })),
      Then('the value was built only once')((s) => {
        try {
          expect(s.outcome.started).toBe(1)
        } finally {
          vi.useRealTimers()
        }
      }),
    ),
  )

  scenario(
    'Derived values — an abandoned source is swept after a switch',
    Gherkin.Do.pipe(
      Given('a kept-alive derived value had been built from the first of two sources')(
        'setup',
        () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            const flags = { useFirst: true }
            const first = Atom.make('first')
            const second = Atom.make('second')
            const switching = Atom.readable((get) =>
              Match.value(flags.useFirst).pipe(
                Match.when(true, () => get(first)),
                Match.orElse(() => get(second)),
              )
            ).pipe(Atom.keepAlive)
            const page = Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
            const before = page.get(switching)
            return { page, first, second, switching, before, flags }
          }),
      ),
      When('the derived value switches sources and the cleanup window passes')('outcome', (s) =>
        Effect.sync(() => {
          s.setup.flags.useFirst = false
          s.setup.page.refresh(s.setup.switching)
          const after = s.setup.page.get(s.setup.switching)
          vi.advanceTimersByTime(100)
          const keys = HashSet.fromIterable(s.setup.page.getNodes().keys())
          return { after, keys }
        })),
      Then('the abandoned source is swept while the new one stays')((s) => {
        try {
          expect(s.setup.before).toBe('first')
          expect(s.outcome.after).toBe('second')
          expect(HashSet.has(s.outcome.keys, s.setup.first)).toBe(false)
          expect(HashSet.has(s.outcome.keys, s.setup.second)).toBe(true)
        } finally {
          vi.useRealTimers()
        }
      }),
    ),
  )

  scenario(
    'Derived values — a listened source survives after a switch away',
    Gherkin.Do.pipe(
      Given('a derived value had been built from the first of two sources with a listener on the first')(
        'setup',
        () =>
          Effect.sync(() => {
            const first = Atom.make(1)
            const second = Atom.make(2)
            const flags = { useFirst: true }
            const switching = Atom.readable((get) =>
              Match.value(flags.useFirst).pipe(
                Match.when(true, () => get(first)),
                Match.orElse(() => get(second)),
              )
            )
            const page = Registry.make()
            page.subscribe(first, () => {})
            page.get(switching)
            return { page, first, second, switching, flags }
          }),
      ),
      When('the derived value switches to the second source')('outcome', (s) =>
        Effect.sync(() => {
          s.setup.flags.useFirst = false
          s.setup.page.refresh(s.setup.switching)
          const value = s.setup.page.get(s.setup.switching)
          const keys = HashSet.fromIterable(s.setup.page.getNodes().keys())
          return { value, keys }
        })),
      Then('the listened source is kept alongside the new one')((s) => {
        expect(s.outcome.value).toBe(2)
        expect(HashSet.has(s.outcome.keys, s.setup.first)).toBe(true)
        expect(HashSet.has(s.outcome.keys, s.setup.second)).toBe(true)
      }),
    ),
  )

  scenario(
    'Settled reads — a read overlapping a refresh settles on the fresh answer',
    Gherkin.Do.pipe(
      Given('a value backed by work gated on a latch')('setup', () =>
        Effect.sync(() => {
          const latch = Latch.makeUnsafe()
          const store = { current: 1 }
          const effect: Effect.Effect<number> = Effect.gen(function*() {
            yield* latch.await
            return store.current
          })
          const source = Atom.make(effect)
          const page = Registry.make()
          return { latch, store, source, page }
        })),
      When('a read overlaps a refresh while the gate opens and closes')('outcome', (s) =>
        Effect.gen(function*() {
          s.setup.latch.openUnsafe()
          yield* Effect.yieldNow
          const first = s.setup.page.get(s.setup.source)
          s.setup.store.current = 2
          s.setup.latch.closeUnsafe()
          s.setup.page.refresh(s.setup.source)
          const pending = Effect.runFork(Registry.getResult(s.setup.page, s.setup.source, { suspendOnWaiting: true }))
          s.setup.latch.openUnsafe()
          const settled = yield* Fiber.join(pending)
          return { first, settled }
        })),
      Then('the first read keeps the earlier answer and the settled read has the later one')((s) => {
        expect(Result.isSuccess(s.outcome.first)).toBe(true)
        const firstValue = Match.value(s.outcome.first).pipe(
          Match.when({ _tag: 'Success' }, (success) => success.value),
          Match.orElse(() => -1),
        )
        expect(firstValue).toBe(1)
        expect(s.outcome.settled).toBe(2)
      }),
    ),
  )

  scenario(
    'Settled reads — an already settled value answers immediately',
    Gherkin.Do.pipe(
      Given('a value that had already settled')('setup', () =>
        Effect.sync(() => {
          const settled = Atom.make<Result.Result<number, never>>(Result.success(10))
          const page = Registry.make()
          return { settled, page }
        })),
      When('the settled value is awaited')('outcome', (s) => Registry.getResult(s.setup.page, s.setup.settled)),
      Then('it answers at once with its value')((s) => {
        expect(s.outcome).toBe(10)
      }),
    ),
  )

  scenario(
    'Settled reads — waiting reads resolve through loading, waiting and flickering updates',
    Gherkin.Do.pipe(
      Given('three values resting in a loading state')('setup', () =>
        Effect.sync(() => {
          const loading = Atom.make<Result.Result<number, never>>(Result.initial(false))
          const waiting = Atom.make<Result.Result<number, never>>(Result.initial(false))
          const flickering = Atom.make<Result.Result<number, never>>(Result.initial(false))
          const page = Registry.make()
          return { loading, waiting, flickering, page }
        })),
      When('waiting reads run while loading, waiting and flickering updates land')(
        'outcome',
        (s) =>
          Effect.gen(function*() {
            const fromLoading = Effect.runFork(Registry.getResult(s.setup.page, s.setup.loading))
            s.setup.page.set(s.setup.loading, Result.success(20))
            const waited = yield* Fiber.join(fromLoading)
            const fromWaiting = Effect.runFork(
              Registry.getResult(s.setup.page, s.setup.waiting, { suspendOnWaiting: true }),
            )
            s.setup.page.set(s.setup.waiting, Result.success(1, { waiting: true }))
            s.setup.page.set(s.setup.waiting, Result.success(2))
            const waitedThrough = yield* Fiber.join(fromWaiting)
            const fromFlicker = Effect.runFork(Registry.getResult(s.setup.page, s.setup.flickering))
            s.setup.page.set(s.setup.flickering, Result.initial(true))
            s.setup.page.set(s.setup.flickering, Result.success(30))
            const waitedPastFlicker = yield* Fiber.join(fromFlicker)
            return { waited, waitedThrough, waitedPastFlicker }
          }),
      ),
      Then('each waiting read resolves to the final value')((s) => {
        expect(s.outcome.waited).toBe(20)
        expect(s.outcome.waitedThrough).toBe(2)
        expect(s.outcome.waitedPastFlicker).toBe(30)
      }),
    ),
  )

  scenario(
    'Subscriptions and streams — a new immediate listener hears the current value',
    Gherkin.Do.pipe(
      Given('a value had been read on a fresh page')('setup', () =>
        Effect.sync(() => {
          const value = Atom.make(5)
          const page = Registry.make()
          page.get(value)
          return { value, page }
        })),
      When('a listener subscribes asking for the current value')('outcome', (s) =>
        Effect.sync(() => {
          const heard: Array<number> = []
          s.setup.page.subscribe(s.setup.value, (v) => heard.push(v), { immediate: true })
          return { heard }
        })),
      Then('the listener hears the current value once')((s) => {
        expect(s.outcome.heard).toEqual([5])
      }),
    ),
  )

  scenario(
    'Subscriptions and streams — a value never read leaves once its listener goes',
    Gherkin.Do.pipe(
      Given('a value had been touched only by a listener')('setup', () =>
        Effect.sync(() => {
          const value = Atom.make(1)
          const page = Registry.make()
          const cancel = page.subscribe(value, () => {})
          return { value, page, cancel }
        })),
      When('the listener leaves')('outcome', (s) =>
        Effect.gen(function*() {
          const node = Match.value(s.setup.page.getNodes().get(s.setup.value)).pipe(
            Match.when(undefined, () => {
              throw new Error('expected a node after the value was touched')
            }),
            Match.orElse((found) => found),
          )
          const before = node.currentState()
          s.setup.cancel()
          yield* Effect.yieldNow
          return { before, hasValue: HashSet.has(HashSet.fromIterable(s.setup.page.getNodes().keys()), s.setup.value) }
        })),
      Then('the never-read value is gone and it had never initialized')((s) => {
        expect(s.outcome.before).toBe('uninitialized')
        expect(s.outcome.hasValue).toBe(false)
      }),
    ),
  )

  scenario(
    'Subscriptions and streams — a watched value replays the current number then the change',
    Gherkin.Do.pipe(
      Given('a value resting at its initial number')('setup', () =>
        Effect.sync(() => {
          const value = Atom.make(1)
          const page = Registry.make()
          return { value, page }
        })),
      When('its stream is watched while the value changes')('outcome', (s) =>
        Effect.gen(function*() {
          const heard: Array<number> = []
          const first = Latch.makeUnsafe()
          const second = Latch.makeUnsafe()
          const fiber = yield* Effect.forkChild(
            Effect.scoped(
              Stream.runForEach(Registry.toStream(s.setup.page, s.setup.value), (n) =>
                Effect.gen(function*() {
                  heard.push(n)
                  yield* Effect.when(
                    Effect.sync(() => {
                      first.openUnsafe()
                    }),
                    Effect.sync(() => heard.length === 1),
                  )
                  yield* Effect.when(
                    Effect.sync(() => {
                      second.openUnsafe()
                    }),
                    Effect.sync(() => n === 2),
                  )
                })),
            ),
          )
          yield* first.await
          s.setup.page.set(s.setup.value, 2)
          yield* second.await
          yield* Fiber.interrupt(fiber)
          return { heard }
        })),
      Then('the stream had replayed the current value then the change')((s) => {
        expect(s.outcome.heard).toEqual([1, 2])
      }),
    ),
  )

  scenario(
    'Subscriptions and streams — a settled stream skips repeats and ends on failure',
    Gherkin.Do.pipe(
      Given('a settled value resting in a loading state')('setup', () =>
        Effect.sync(() => {
          const value = Atom.make<Result.Result<number, string>>(Result.initial(false))
          const page = Registry.make()
          return { value, page }
        })),
      When('its settled stream is watched through updates, a repeat and a failure')(
        'outcome',
        (s) =>
          Effect.gen(function*() {
            const heard: Array<number> = []
            const first = Latch.makeUnsafe()
            const second = Latch.makeUnsafe()
            const fiber = yield* Effect.forkChild(
              Effect.scoped(
                Stream.runForEach(Registry.toStreamResult(s.setup.page, s.setup.value), (n) =>
                  Effect.gen(function*() {
                    heard.push(n)
                    yield* Effect.when(
                      Effect.sync(() => {
                        first.openUnsafe()
                      }),
                      Effect.sync(() => heard.length === 1),
                    )
                    yield* Effect.when(
                      Effect.sync(() => {
                        second.openUnsafe()
                      }),
                      Effect.sync(() => n === 2),
                    )
                  })),
              ),
            )
            yield* Effect.yieldNow
            s.setup.page.set(s.setup.value, Result.success(1))
            yield* first.await
            s.setup.page.set(s.setup.value, Result.success(2))
            yield* second.await
            s.setup.page.set(s.setup.value, Result.success(2))
            yield* Effect.yieldNow
            const afterDuplicate = heard.length
            s.setup.page.set(s.setup.value, Result.failure<number, string>(Cause.fail('boom')))
            const exit = yield* Effect.exit(Fiber.join(fiber))
            return { heard, afterDuplicate, exit }
          }),
      ),
      Then('repeats are skipped, both values arrive, and the failure ends the stream')((s) => {
        expect(s.outcome.heard).toEqual([1, 2])
        expect(s.outcome.afterDuplicate).toBe(2)
        expect(Exit.isFailure(s.outcome.exit)).toBe(true)
      }),
    ),
  )

  scenario(
    'Subscriptions and streams — a stream over an already failed value fails at once',
    Gherkin.Do.pipe(
      Given('a value that had already failed')('setup', () =>
        Effect.sync(() => {
          const failing = Atom.make<Result.Result<number, string>>(Result.failure<number, string>(Cause.fail('boom')))
          const page = Registry.make()
          return { failing, page }
        })),
      When('its settled stream is collected')('outcome', (s) =>
        Effect.gen(function*() {
          const fiber = yield* Effect.forkChild(
            Effect.scoped(Stream.runCollect(Registry.toStreamResult(s.setup.page, s.setup.failing))),
          )
          return yield* Effect.exit(Fiber.join(fiber))
        })),
      Then('the stream fails at once')((s) => {
        expect(Exit.isFailure(s.outcome)).toBe(true)
      }),
    ),
  )

  scenario(
    'Subscriptions and streams — exposed streams carry settled and failed outcomes',
    Gherkin.Do.pipe(
      Given('a settled value and a failed value exposed as streams')('setup', () =>
        Effect.sync(() => {
          const successResult = Atom.make<Result.Result<number, never>>(Result.success(3))
          const failureResult = Atom.make<Result.Result<number, string>>(
            Result.failure<number, string>(Cause.fail('boom')),
          )
          const successStream = Atom.keepAlive(Atom.readable((get) => get.streamResult(successResult)))
          const failureStream = Atom.keepAlive(Atom.readable((get) => get.streamResult(failureResult)))
          const page = Registry.make()
          return { successStream, failureStream, page }
        })),
      When('both exposed streams are read')('outcome', (s) =>
        Effect.gen(function*() {
          const heard: Array<number> = []
          const got = Latch.makeUnsafe()
          const successFiber = yield* Effect.forkChild(
            Effect.scoped(
              Stream.runForEach(s.setup.page.get(s.setup.successStream), (n) =>
                Effect.sync(() => {
                  heard.push(n)
                  got.openUnsafe()
                })),
            ),
          )
          yield* got.await
          yield* Fiber.interrupt(successFiber)
          const failureFiber = yield* Effect.forkChild(
            Effect.scoped(Stream.runCollect(s.setup.page.get(s.setup.failureStream))),
          )
          const exit = yield* Effect.exit(Fiber.join(failureFiber))
          return { chunk: heard, exit }
        })),
      Then('the settled stream replays its value and the failed one fails')((s) => {
        expect(s.outcome.chunk).toEqual([3])
        expect(Exit.isFailure(s.outcome.exit)).toBe(true)
      }),
    ),
  )

  scenario(
    'Idle expiry — values sharing a cleanup schedule are swept together',
    Gherkin.Do.pipe(
      Given('two values had been read on a page sharing one cleanup schedule')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const first = Atom.make(1)
          const second = Atom.make(2)
          const page = Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
          page.get(first)
          page.get(second)
          return { first, second, page }
        })),
      When('the shared cleanup window passes')('outcome', (s) =>
        Effect.sync(() => {
          vi.advanceTimersByTime(100)
          return { keys: HashSet.fromIterable(s.setup.page.getNodes().keys()) }
        })),
      Then('both values are swept together')((s) => {
        try {
          expect(HashSet.has(s.outcome.keys, s.setup.first)).toBe(false)
          expect(HashSet.has(s.outcome.keys, s.setup.second)).toBe(false)
        } finally {
          vi.useRealTimers()
        }
      }),
    ),
  )

  scenario(
    'Idle expiry — a reread while cleanup is pending survives the first window',
    Gherkin.Do.pipe(
      Given('an effect-backed value had been read on a long-lived page')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const store = { starts: 0 }
          const value = Atom.make(Effect.sync(() => {
            store.starts++
            return 1
          }))
          const page = Registry.make({ defaultIdleTTL: 100, timeoutResolution: 10 })
          page.get(value)
          return { value, page, store }
        })),
      When('the value is reread mid-window, left past the first window, then read late')(
        'outcome',
        (s) =>
          Effect.sync(() => {
            vi.advanceTimersByTime(50)
            s.setup.page.get(s.setup.value)
            vi.advanceTimersByTime(60)
            const afterFirstWindow = s.setup.store.starts
            vi.advanceTimersByTime(100)
            s.setup.page.get(s.setup.value)
            const afterSecondWindow = s.setup.store.starts
            return { afterFirstWindow, afterSecondWindow }
          }),
      ),
      Then('the first window reuses the build and the second rebuilds')((s) => {
        try {
          expect(s.outcome.afterFirstWindow).toBe(1)
          expect(s.outcome.afterSecondWindow).toBe(2)
        } finally {
          vi.useRealTimers()
        }
      }),
    ),
  )

  scenario(
    'Idle expiry — a parent and child falling idle are swept together',
    Gherkin.Do.pipe(
      Given('a derived value had been read from its source')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const source = Atom.make(1)
          const derived = Atom.readable((get) => get(source))
          const page = Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
          page.get(derived)
          const node = Match.value(page.getNodes().get(derived)).pipe(
            Match.when(undefined, () => {
              throw new Error('expected a node after reading the value')
            }),
            Match.orElse((found) => found),
          )
          const before = node.currentState()
          return { source, derived, page, node, before }
        })),
      When('both fall idle past the cleanup window')('outcome', (s) =>
        Effect.sync(() => {
          vi.advanceTimersByTime(100)
          return {
            keys: HashSet.fromIterable(s.setup.page.getNodes().keys()),
            after: s.setup.node.currentState(),
          }
        })),
      Then('parent and child are swept together')((s) => {
        try {
          expect(s.setup.before).toBe('valid')
          expect(s.outcome.after).toBe('removed')
          expect(HashSet.has(s.outcome.keys, s.setup.derived)).toBe(false)
          expect(HashSet.has(s.outcome.keys, s.setup.source)).toBe(false)
        } finally {
          vi.useRealTimers()
        }
      }),
    ),
  )

  scenario(
    'Idle expiry — a listened parent survives while its idle child is swept',
    Gherkin.Do.pipe(
      Given('a derived value had been read with a listener on its source')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const source = Atom.make(1)
          const derived = Atom.readable((get) => get(source))
          const page = Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
          page.get(derived)
          page.subscribe(source, () => {})
          return { source, derived, page }
        })),
      When('the cleanup window passes')('outcome', (s) =>
        Effect.sync(() => {
          vi.advanceTimersByTime(100)
          return { keys: HashSet.fromIterable(s.setup.page.getNodes().keys()) }
        })),
      Then('the idle child is swept while the listened parent stays')((s) => {
        try {
          expect(HashSet.has(s.outcome.keys, s.setup.derived)).toBe(false)
          expect(HashSet.has(s.outcome.keys, s.setup.source)).toBe(true)
        } finally {
          vi.useRealTimers()
        }
      }),
    ),
  )

  scenario(
    'Idle expiry — a parent kept on a longer schedule is swept later',
    Gherkin.Do.pipe(
      Given('a derived value had been read whose source keeps a longer schedule')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const source = Atom.setIdleTTL(20)(Atom.make(1))
          const derived = Atom.readable((get) => get(source))
          const page = Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
          page.get(derived)
          return { source, derived, page }
        })),
      When('the first window passes, then the second')('outcome', (s) =>
        Effect.sync(() => {
          vi.advanceTimersByTime(15)
          const afterFirstWindow = HashSet.fromIterable(s.setup.page.getNodes().keys())
          vi.advanceTimersByTime(100)
          const afterSecondWindow = HashSet.fromIterable(s.setup.page.getNodes().keys())
          return { afterFirstWindow, afterSecondWindow }
        })),
      Then('the child is swept first and the source follows later')((s) => {
        try {
          expect(HashSet.has(s.outcome.afterFirstWindow, s.setup.derived)).toBe(false)
          expect(HashSet.has(s.outcome.afterFirstWindow, s.setup.source)).toBe(true)
          expect(HashSet.has(s.outcome.afterSecondWindow, s.setup.source)).toBe(false)
        } finally {
          vi.useRealTimers()
        }
      }),
    ),
  )

  scenario(
    'Idle expiry — rereads before the window clear pending timers',
    Gherkin.Do.pipe(
      Given('two values had been read on a shared page')('setup', () =>
        Effect.sync(() => {
          vi.useFakeTimers()
          const first = Atom.make(1)
          const second = Atom.make(2)
          const page = Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
          page.get(first)
          page.get(second)
          return { first, second, page }
        })),
      When('both are reread just before the window, then the window passes')('outcome', (s) =>
        Effect.sync(() => {
          vi.advanceTimersByTime(1)
          s.setup.page.get(s.setup.first)
          s.setup.page.get(s.setup.second)
          vi.advanceTimersByTime(100)
          return { keys: HashSet.fromIterable(s.setup.page.getNodes().keys()) }
        })),
      Then('both values are swept together')((s) => {
        try {
          expect(HashSet.has(s.outcome.keys, s.setup.first)).toBe(false)
          expect(HashSet.has(s.outcome.keys, s.setup.second)).toBe(false)
        } finally {
          vi.useRealTimers()
        }
      }),
    ),
  )

  scenario(
    'Mounting and disposal — a mounted value is released when its lifetime closes',
    Gherkin.Do.pipe(
      Given('a value resting on a fresh page')('setup', () =>
        Effect.sync(() => {
          const value = Atom.make(1)
          const page = Registry.make()
          return { value, page }
        })),
      When('the mount lifetime closes')('outcome', (s) =>
        Effect.gen(function*() {
          yield* Effect.scoped(Registry.mount(s.setup.page, s.setup.value))
          yield* Effect.yieldNow
          return { hasValue: HashSet.has(HashSet.fromIterable(s.setup.page.getNodes().keys()), s.setup.value) }
        })),
      Then('the mounted value is released')((s) => {
        expect(s.outcome.hasValue).toBe(false)
      }),
    ),
  )

  scenario(
    'Mounting and disposal — default and preloaded layers serve their values',
    Gherkin.Do.pipe(
      Given('a default layer and a preloaded layer had been prepared')('setup', () =>
        Effect.sync(() => {
          const value = Atom.make(1)
          const other = Atom.make(2)
          return { value, other }
        })),
      When('each layer serves its own value')('outcome', (s) =>
        Effect.gen(function*() {
          const defaultRead = yield* Effect.provide(Registry.layer)(
            Effect.gen(function*() {
              const registry = yield* Registry.AtomRegistry
              return registry.get(s.setup.value)
            }),
          )
          const preloadedRead = yield* Effect.provide(Registry.layerOptions({ initialValues: [[s.setup.other, 9]] }))(
            Effect.gen(function*() {
              const registry = yield* Registry.AtomRegistry
              return registry.get(s.setup.other)
            }),
          )
          return { defaultRead, preloadedRead }
        })),
      Then('the default value and the preload each read back')((s) => {
        expect(s.outcome.defaultRead).toBe(1)
        expect(s.outcome.preloadedRead).toBe(9)
      }),
    ),
  )

  scenario(
    'Mounting and disposal — a disposed registry refuses new values',
    Gherkin.Do.pipe(
      Given('a page holding one value')('setup', () =>
        Effect.sync(() => {
          const page = Registry.make()
          const value = Atom.make(1)
          page.get(value)
          return { page, value }
        })),
      When('the page is disposed and a new value is read')('outcome', (s) =>
        Effect.gen(function*() {
          s.setup.page.dispose()
          const size = s.setup.page.getNodes().size
          const exit = yield* Effect.exit(Effect.sync(() => s.setup.page.get(Atom.make(2))))
          const message = Match.value(exit).pipe(
            Match.when({ _tag: 'Failure' }, (failure) => Cause.pretty(failure.cause)),
            Match.orElse(() => 'read did not fail'),
          )
          return { size, message }
        })),
      Then('the page is empty and the read is refused')((s) => {
        expect(s.outcome.size).toBe(0)
        expect(s.outcome.message).toContain('disposed')
      }),
    ),
  )

  scenario(
    'Batching — batched writes notify listeners once with the final value',
    Gherkin.Do.pipe(
      Given('a value with a listener on a fresh page')('setup', () =>
        Effect.sync(() => {
          const value = Atom.make(1)
          const page = Registry.make()
          const heard: Array<number> = []
          page.subscribe(value, (v) => heard.push(v))
          return { value, page, heard }
        })),
      When('several writes land inside one batch')('outcome', (s) =>
        Effect.sync(() => {
          Registry.batch(() => {
            s.setup.page.set(s.setup.value, 2)
            s.setup.page.set(s.setup.value, 3)
            s.setup.page.set(s.setup.value, 4)
          })
          return { heard: s.setup.heard }
        })),
      Then('the listener is notified once with the final value')((s) => {
        expect(s.outcome.heard).toEqual([4])
      }),
    ),
  )

  scenario(
    'Batching — a value invalidating itself in a batch rebuilds once',
    Gherkin.Do.pipe(
      Given('a value that writes its source while building')('setup', () =>
        Effect.sync(() => {
          const source = Atom.make(0)
          const flags = { firstBuild: true }
          const selfInvalidating = Atom.readable((get) => {
            const current = get(source)
            Match.value(flags.firstBuild).pipe(
              Match.when(true, () => {
                flags.firstBuild = false
                get.set(source, current + 1)
              }),
              Match.orElse(() => undefined),
            )
            return current
          })
          const page = Registry.make()
          return { selfInvalidating, page }
        })),
      When('the value is built inside a batch')('outcome', (s) =>
        Effect.sync(() => {
          Registry.batch(() => {
            s.setup.page.get(s.setup.selfInvalidating)
          })
          return { value: s.setup.page.get(s.setup.selfInvalidating) }
        })),
      Then('it rebuilds once to the invalidated answer')((s) => {
        expect(s.outcome.value).toBe(1)
      }),
    ),
  )

  scenario(
    'Batching — a batch invalidating source and derived rebuilds the source first',
    Gherkin.Do.pipe(
      Given('a source and its derived value had both been read')('setup', () =>
        Effect.sync(() => {
          const source = Atom.make(1)
          const derived = Atom.readable((get) => get(source))
          const page = Registry.make()
          page.get(source)
          page.get(derived)
          return { source, derived, page }
        })),
      When('one batch invalidates both the derived value and its source')('outcome', (s) =>
        Effect.sync(() => {
          Registry.batch(() => {
            s.setup.page.refresh(s.setup.derived)
            s.setup.page.refresh(s.setup.source)
          })
          return { source: s.setup.page.get(s.setup.source), derived: s.setup.page.get(s.setup.derived) }
        })),
      Then('both still read their steady values')((s) => {
        expect(s.outcome.source).toBe(1)
        expect(s.outcome.derived).toBe(1)
      }),
    ),
  )

  scenario(
    'Batching — a value refreshing itself in a batch rebuilds once',
    Gherkin.Do.pipe(
      Given('a value that refreshes itself while building')('setup', () =>
        Effect.sync(() => {
          const source = Atom.make(0)
          const flags = { firstBuild: true }
          const selfRefreshing = Atom.readable((get) => {
            const current = get(source)
            Match.value(flags.firstBuild).pipe(
              Match.when(true, () => {
                flags.firstBuild = false
                get.refreshSelf()
              }),
              Match.orElse(() => undefined),
            )
            return current
          })
          const page = Registry.make()
          return { selfRefreshing, page }
        })),
      When('the value is built inside a batch')('outcome', (s) =>
        Effect.sync(() => {
          Registry.batch(() => {
            s.setup.page.get(s.setup.selfRefreshing)
          })
          return { value: s.setup.page.get(s.setup.selfRefreshing) }
        })),
      Then('it settles on its initial answer')((s) => {
        expect(s.outcome.value).toBe(0)
      }),
    ),
  )

  scenario(
    'Initial values — preloading announces the preloaded value to listeners',
    Gherkin.Do.pipe(
      Given('a value with a listener on a fresh page')('setup', () =>
        Effect.sync(() => {
          const value = Atom.make(1)
          const page = Registry.make()
          const heard: Array<number> = []
          page.subscribe(value, (v) => heard.push(v))
          return { value, page, heard }
        })),
      When('an initial value is preloaded')('outcome', (s) =>
        Effect.sync(() => {
          s.setup.page.setInitialValue(s.setup.value, 10)
          return { heard: s.setup.heard, read: s.setup.page.get(s.setup.value) }
        })),
      Then('listeners hear the preload and reads return it')((s) => {
        expect(s.outcome.heard).toEqual([10])
        expect(s.outcome.read).toBe(10)
      }),
    ),
  )

  scenario(
    'Initial values — preloading replaces an already built value',
    Gherkin.Do.pipe(
      Given('a value that had already been built')('setup', () =>
        Effect.sync(() => {
          const value = Atom.make(1)
          const page = Registry.make()
          page.get(value)
          return { value, page }
        })),
      When('a new initial value is preloaded')('outcome', (s) =>
        Effect.sync(() => {
          s.setup.page.setInitialValue(s.setup.value, 7)
          return { read: s.setup.page.get(s.setup.value) }
        })),
      Then('reads return the preloaded value')((s) => {
        expect(s.outcome.read).toBe(7)
      }),
    ),
  )

  scenario(
    'Initial values — a preload inside a batch survives the batch',
    Gherkin.Do.pipe(
      Given('a fresh value on a fresh page')('setup', () =>
        Effect.sync(() => {
          const fresh = Atom.make(2)
          const page = Registry.make()
          return { fresh, page }
        })),
      When('the initial value is preloaded inside a batch')('outcome', (s) =>
        Effect.sync(() => {
          Registry.batch(() => {
            s.setup.page.setInitialValue(s.setup.fresh, 5)
          })
          return { read: s.setup.page.get(s.setup.fresh) }
        })),
      Then('reads return the preloaded value')((s) => {
        expect(s.outcome.read).toBe(5)
      }),
    ),
  )

  scenario(
    'Initial values — preloading a derived value routes to its source',
    Gherkin.Do.pipe(
      Given('a derived value bound to its source')('setup', () =>
        Effect.sync(() => {
          const source = Atom.make(1)
          const derived = Atom.transform(source, (get) => get(source), { initialValueTarget: source })
          const page = Registry.make()
          return { source, derived, page }
        })),
      When('an initial value is preloaded through the derived value')('outcome', (s) =>
        Effect.sync(() => {
          s.setup.page.setInitialValue(s.setup.derived, 7)
          return {
            derived: s.setup.page.get(s.setup.derived),
            source: s.setup.page.get(s.setup.source),
          }
        })),
      Then('both the derived value and its source read the preload')((s) => {
        expect(s.outcome.derived).toBe(7)
        expect(s.outcome.source).toBe(7)
      }),
    ),
  )

  scenario(
    'Serializable preloads — a stored value applies to an already built value',
    Gherkin.Do.pipe(
      Given('a serializable value that had already been built')('setup', () =>
        Effect.sync(() => {
          const direct = Atom.make(2).pipe(Atom.serializable({ key: 'direct-key', schema: Schema.Number }))
          const page = Registry.make()
          page.get(direct)
          return { direct, page }
        })),
      When('a stored value arrives for its key')('outcome', (s) =>
        Effect.sync(() => {
          s.setup.page.setSerializable('direct-key', 9)
          return { read: s.setup.page.get(s.setup.direct) }
        })),
      Then('reads return the stored value')((s) => {
        expect(s.outcome.read).toBe(9)
      }),
    ),
  )

  scenario(
    'Serializable preloads — a stored value for a derived value routes to its source',
    Gherkin.Do.pipe(
      Given('a serializable derived value bound to its source')('setup', () =>
        Effect.sync(() => {
          const source = Atom.make(1)
          const derived = Atom.transform(source, (get) => get(source), { initialValueTarget: source }).pipe(
            Atom.serializable({ key: 'derived-key', schema: Schema.Number }),
          )
          const page = Registry.make()
          return { source, derived, page }
        })),
      When('a stored value arrives for the derived key')('outcome', (s) =>
        Effect.sync(() => {
          s.setup.page.setSerializable('derived-key', 7)
          return {
            derived: s.setup.page.get(s.setup.derived),
            source: s.setup.page.get(s.setup.source),
          }
        })),
      Then('both the derived value and its source read the stored value')((s) => {
        expect(s.outcome.derived).toBe(7)
        expect(s.outcome.source).toBe(7)
      }),
    ),
  )

  scenario(
    'Serializable preloads — refreshing a stored value rebuilds from its definition',
    Gherkin.Do.pipe(
      Given('a serializable value holding a stored value')('setup', () =>
        Effect.sync(() => {
          const direct = Atom.make(2).pipe(Atom.serializable({ key: 'unread-key', schema: Schema.Number }))
          const page = Registry.make()
          page.subscribe(direct, () => {})
          page.setSerializable('unread-key', 9)
          const stored = page.get(direct)
          return { direct, page, stored }
        })),
      When('the value is refreshed')('outcome', (s) =>
        Effect.sync(() => {
          s.setup.page.refresh(s.setup.direct)
          return { rebuilt: s.setup.page.get(s.setup.direct) }
        })),
      Then('the stored value had applied, then the definition rebuilds')((s) => {
        expect(s.setup.stored).toBe(9)
        expect(s.outcome.rebuilt).toBe(2)
      }),
    ),
  )

  scenario(
    'Laziness — a lazy value with an active child rebuilds immediately',
    Gherkin.Do.pipe(
      Given('a lazy chain with an active child had been read')('setup', () =>
        Effect.sync(() => {
          const source = Atom.make(1)
          const root = Atom.readable((get) => get(source))
          const activeChild = Atom.setLazy(false)(Atom.readable((get) => get(root)))
          const page = Registry.make()
          page.get(root)
          page.get(activeChild)
          const node = Match.value(page.getNodes().get(root)).pipe(
            Match.when(undefined, () => {
              throw new Error('expected a node after reading the value')
            }),
            Match.orElse((found) => found),
          )
          return { root, page, node }
        })),
      When('the root is refreshed')('outcome', (s) =>
        Effect.sync(() => {
          s.setup.page.refresh(s.setup.root)
          return { state: s.setup.node.currentState(), read: s.setup.page.get(s.setup.root) }
        })),
      Then('the root is valid again and reads its steady value')((s) => {
        expect(s.outcome.state).toBe('valid')
        expect(s.outcome.read).toBe(1)
      }),
    ),
  )

  scenario(
    'Laziness — a lazy chain holds stale values until they are reread',
    Gherkin.Do.pipe(
      Given('a lazy chain with two branches had been fully read')('setup', () =>
        Effect.sync(() => {
          const source = Atom.make(1)
          const root = Atom.readable((get) => get(source))
          const left = Atom.readable((get) => get(root))
          const right = Atom.readable((get) => get(root))
          const leftChild = Atom.readable((get) => get(left))
          const rightChild = Atom.readable((get) => get(right))
          const page = Registry.make()
          page.get(root)
          page.get(left)
          page.get(right)
          page.get(leftChild)
          page.get(rightChild)
          const node = Match.value(page.getNodes().get(root)).pipe(
            Match.when(undefined, () => {
              throw new Error('expected a node after reading the value')
            }),
            Match.orElse((found) => found),
          )
          return { root, page, node }
        })),
      When('the root is refreshed and a newcomer reads it')('outcome', (s) =>
        Effect.sync(() => {
          s.setup.page.refresh(s.setup.root)
          const afterRefresh = s.setup.node.currentState()
          const newcomer = Atom.readable((get) => get(s.setup.root))
          s.setup.page.get(newcomer)
          return {
            afterRefresh,
            state: s.setup.node.currentState(),
            read: s.setup.page.get(s.setup.root),
          }
        })),
      Then('the root holds stale until reread, then settles valid')((s) => {
        expect(s.outcome.afterRefresh).toBe('stale')
        expect(s.outcome.state).toBe('valid')
        expect(s.outcome.read).toBe(1)
      }),
    ),
  )

  scenario(
    'Invalidation — scheduled work stops and waiting readers settle when values change',
    Gherkin.Do.pipe(
      Given('a kept-alive value with scheduled work and waiting readers')('setup', () =>
        Effect.sync(() => {
          const registry = Registry.make()
          const source = Atom.make(1)
          const plain = Atom.make(3)
          const plainWritable = Atom.make(0)
          const resultWritable = Atom.make<Result.Result<number, never>>(Result.initial(false))
          const settled = Atom.make<Result.Result<number, never>>(Result.success(5))
          const loading = Atom.make<Result.Result<number, never>>(Result.initial(true))
          const initialResult = Atom.make<Result.Result<number, never>>(Result.initial(false))
          const waiting = Atom.make<Result.Result<number, never>>(Result.success(1, { waiting: true }))
          const failed = Atom.make<Result.Result<number, string>>(Result.failure<number, string>(Cause.fail('boom')))
          const settledOption = Atom.make<Option.Option<number>>(Option.some(1))
          const noOption = Atom.make<Option.Option<number>>(Option.none())
          const fibers: Array<Fiber.Fiber<number, never>> = []
          const value = Atom.keepAlive(Atom.readable((get) => {
            void get.result(settled)
            void get.result(failed)
            void get.result(initialResult)
            void get.result(waiting, { suspendOnWaiting: true })
            void get.some(settledOption)
            void get.some(noOption)
            fibers.push(Effect.runFork(get.resultOnce(settled)))
            fibers.push(Effect.runFork(get.resultOnce(loading)))
            fibers.push(Effect.runFork(get.someOnce(settledOption)))
            fibers.push(Effect.runFork(get.resultOnce(waiting, { suspendOnWaiting: true })))
            fibers.push(Effect.runFork(get.someOnce(noOption)))
            Effect.runFork(get.setResult(resultWritable, Result.success(4)))
            get.addFinalizer(() => {
              get.self()
            })
            get.addFinalizer(() => {
              get(plain)
              get.get(plain)
            })
            get.addFinalizer(() => {
              get.refresh(plain)
            })
            get.addFinalizer(() => {
              get.refreshSelf()
            })
            get.addFinalizer(() => {
              get.mount(plain)
            })
            get.addFinalizer(() => {
              get.subscribe(plain, () => {})
            })
            get.addFinalizer(() => {
              get.set(plainWritable, 2)
            })
            get.addFinalizer(() => {
              get.setSelf(4)
            })
            get.addFinalizer(() => {
              const _stream = get.stream(plain)
            })
            get.addFinalizer(() => {
              const _effect = get.setResult(resultWritable, Result.success(4))
            })
            get.addFinalizer(() => {
              const _result = get.result(failed)
            })
            get.addFinalizer(() => {
              const _some = get.some(noOption)
            })
            get.addFinalizer(() => {
              get.addFinalizer(() => {})
            })
            return get.get(source)
          }))
          return { registry, value, fibers, loading, waiting, noOption }
        })),
      When('its dependencies settle and the value is invalidated')('outcome', (s) =>
        Effect.gen(function*() {
          s.setup.registry.get(s.setup.value)
          yield* Effect.yieldNow
          s.setup.registry.set(s.setup.loading, Result.initial(false))
          s.setup.registry.set(s.setup.loading, Result.success(7))
          s.setup.registry.set(s.setup.waiting, Result.success(2, { waiting: true }))
          s.setup.registry.set(s.setup.waiting, Result.success(3))
          s.setup.registry.set(s.setup.noOption, Option.some(5))
          const settledValue = yield* Fiber.join(s.setup.fibers[0])
          const resumedValue = yield* Fiber.join(s.setup.fibers[1])
          const optionValue = yield* Fiber.join(s.setup.fibers[2])
          const throughWaiting = yield* Fiber.join(s.setup.fibers[3])
          const throughNone = yield* Fiber.join(s.setup.fibers[4])
          s.setup.registry.refresh(s.setup.value)
          const node = Match.value(s.setup.registry.getNodes().get(s.setup.value)).pipe(
            Match.when(undefined, () => {
              throw new Error('expected a node after reading the value')
            }),
            Match.orElse((found) => found),
          )
          return {
            settledValue,
            resumedValue,
            optionValue,
            throughWaiting,
            throughNone,
            state: node.currentState(),
          }
        })),
      Then('waiting readers settle on the fresh answers and the value rests stale')((s) => {
        expect(s.outcome.settledValue).toBe(5)
        expect(s.outcome.resumedValue).toBe(7)
        expect(s.outcome.optionValue).toBe(1)
        expect(s.outcome.throughWaiting).toBe(3)
        expect(s.outcome.throughNone).toBe(5)
        expect(s.outcome.state).toBe('stale')
      }),
    ),
  )
})
