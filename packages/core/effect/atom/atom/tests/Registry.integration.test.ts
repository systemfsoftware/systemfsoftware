import { Atom, Registry, Result } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Effect, Exit, Fiber, Latch, Option, Schema, Stream } from 'effect'
import { expect, vi } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Keeping a value that is still loading available to every reader')
  .body(({ scenario }) => {
    scenario(
      'A value that never finishes loading is not started over after several readers check it',
      Gherkin.Do.pipe(
        Given('a value that never finishes loading, with cleanup enabled after a short idle period')(
          'setup',
          () =>
            Effect.sync(() => {
              vi.useFakeTimers()
              let startCount = 0
              const atom = Atom.make(
                Effect.callback<number>(() => {
                  startCount++
                }),
              )
              const registry = Registry.make({ defaultIdleTTL: 10 })
              return { registry, atom, timesStarted: () => startCount }
            }),
        ),
        When('two readers check the value while it is still loading, and the cleanup timer runs')(
          'result',
          (s) =>
            Effect.sync(() => {
              const firstReading = s.setup.registry.get(s.setup.atom)
              const secondReading = s.setup.registry.get(s.setup.atom)
              vi.advanceTimersByTime(100)
              const readingAfterCleanup = s.setup.registry.get(s.setup.atom)
              const started = s.setup.timesStarted()
              vi.useRealTimers()
              return { firstReading, secondReading, readingAfterCleanup, started }
            }),
        ),
        Then('the work only ever started once, and every reader still sees it loading')(
          (s) => {
            expect(s.result.started).toBe(1)
            expect(Result.isInitial(s.result.firstReading) || s.result.firstReading.waiting).toBe(true)
            expect(Result.isInitial(s.result.secondReading) || s.result.secondReading.waiting).toBe(true)
            expect(Result.isInitial(s.result.readingAfterCleanup) || s.result.readingAfterCleanup.waiting).toBe(true)
          },
        ),
      ),
    )
    scenario(
      'A value marked to always stay available is never dropped or restarted by cleanup',
      Gherkin.Do.pipe(
        Given('a value marked to always stay available, with cleanup enabled after a short idle period')(
          'ctx',
          () =>
            Effect.sync(() => {
              vi.useFakeTimers()
              let startCount = 0
              const atom = Atom.keepAlive(
                Atom.make(Effect.callback(() => {
                  startCount++
                })),
              )
              const registry = Registry.make({ defaultIdleTTL: 5 })
              return { registry, atom, timesStarted: () => startCount }
            }),
        ),
        When('a reader checks the value and the cleanup timer runs, then checks it again')(
          'res',
          (s) =>
            Effect.sync(() => {
              const firstReading = s.ctx.registry.get(s.ctx.atom)
              vi.advanceTimersByTime(100)
              const secondReading = s.ctx.registry.get(s.ctx.atom)
              const started = s.ctx.timesStarted()
              vi.useRealTimers()
              return { firstReading, secondReading, started }
            }),
        ),
        Then('the value is still available and its work only ran once')((s) => {
          expect(s.res.started).toBe(1)
        }),
      ),
    )
    scenario(
      'A derived value that switches sources lets the abandoned source be cleaned up',
      Gherkin.Do.pipe(
        Given('a derived value that can follow one of two sources, with a short cleanup timer')(
          'ctx',
          () =>
            Effect.sync(() => {
              vi.useFakeTimers()
              let useFirst = true
              const first = Atom.make('first')
              const second = Atom.make('second')
              const switching = Atom.readable((get) => get(useFirst ? first : second)).pipe(Atom.keepAlive)
              const page = Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
              return {
                page,
                first,
                second,
                switching,
                flip: () => {
                  useFirst = false
                },
              }
            }),
        ),
        When('the derived value switches sources and the cleanup timer runs')('nodes', (s) =>
          Effect.sync(() => {
            const before = s.ctx.page.get(s.ctx.switching)
            s.ctx.flip()
            s.ctx.page.refresh(s.ctx.switching)
            const after = s.ctx.page.get(s.ctx.switching)
            vi.advanceTimersByTime(100)
            const keys = new Set(s.ctx.page.getNodes().keys())
            vi.useRealTimers()
            return { before, after, hasFirst: keys.has(s.ctx.first), hasSecond: keys.has(s.ctx.second) }
          })),
        Then('the abandoned source is gone and the followed one stays')((s) => {
          expect(s.nodes.before).toBe('first')
          expect(s.nodes.after).toBe('second')
          expect(s.nodes.hasFirst).toBe(false)
          expect(s.nodes.hasSecond).toBe(true)
        }),
      ),
    )
    scenario(
      'A reader who asks for a settled answer during a refresh gets the fresh one, not the stale one',
      Gherkin.Do.pipe(
        Given('a stored answer that takes time to refresh')('ctx', () =>
          Effect.sync(() => {
            const latch = Latch.makeUnsafe()
            let stored = 1
            const effect: Effect.Effect<number> = Effect.gen(function*() {
              yield* latch.await
              return stored
            })
            const source = Atom.make(effect)
            const page = Registry.make()
            return {
              page,
              source,
              latch,
              setStored: (n: number) => {
                stored = n
              },
            }
          })),
        When('the answer is refreshed and a reader asks for the settled value mid-refresh')(
          'answer',
          (s) =>
            Effect.gen(function*() {
              s.ctx.latch.openUnsafe()
              yield* Effect.yieldNow
              const first = s.ctx.page.get(s.ctx.source)
              s.ctx.setStored(2)
              s.ctx.latch.closeUnsafe()
              s.ctx.page.refresh(s.ctx.source)
              const pending = Effect.runFork(Registry.getResult(s.ctx.page, s.ctx.source, { suspendOnWaiting: true }))
              s.ctx.latch.openUnsafe()
              const settled = yield* Fiber.join(pending)
              return { first, settled }
            }),
        ),
        Then('the reader waited and received the fresh answer')((s) => {
          expect(Result.isSuccess(s.answer.first) && s.answer.first.value === 1).toBe(true)
          expect(s.answer.settled).toBe(2)
        }),
      ),
    )
    scenario(
      'A listener who asks to hear the current value immediately hears it before any change',
      Gherkin.Do.pipe(
        Given('a value that already exists')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(5)
            const page = Registry.make()
            page.get(value)
            return { page, value }
          })),
        When('a listener attaches asking for the current value immediately')('heard', (s) =>
          Effect.sync(() => {
            const heard: number[] = []
            s.ctx.page.subscribe(s.ctx.value, (v) => heard.push(v), { immediate: true })
            return heard
          })),
        Then('the listener heard the current value without waiting for a change')((s) => {
          expect(s.heard).toEqual([5])
        }),
      ),
    )
    scenario(
      'Two values with the same cleanup schedule are swept together',
      Gherkin.Do.pipe(
        Given('two values with the same short cleanup timer')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            const first = Atom.make(1)
            const second = Atom.make(2)
            const page = Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
            return { page, first, second }
          })),
        When('both are read and the cleanup timer runs')('nodes', (s) =>
          Effect.sync(() => {
            s.ctx.page.get(s.ctx.first)
            s.ctx.page.get(s.ctx.second)
            vi.advanceTimersByTime(100)
            const keys = new Set(s.ctx.page.getNodes().keys())
            vi.useRealTimers()
            return { hasFirst: keys.has(s.ctx.first), hasSecond: keys.has(s.ctx.second) }
          })),
        Then('both are gone')((s) => {
          expect(s.nodes.hasFirst).toBe(false)
          expect(s.nodes.hasSecond).toBe(false)
        }),
      ),
    )
    scenario(
      'A value that is used again while its cleanup is pending is not swept',
      Gherkin.Do.pipe(
        Given('a value with a short cleanup timer')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            let starts = 0
            const value = Atom.make(Effect.sync(() => {
              starts++
              return 1
            }))
            const page = Registry.make({ defaultIdleTTL: 100, timeoutResolution: 10 })
            return { page, value, starts: () => starts }
          })),
        When('the value is read again while its cleanup is pending, then left alone')(
          'readings',
          (s) =>
            Effect.sync(() => {
              s.ctx.page.get(s.ctx.value)
              vi.advanceTimersByTime(50)
              s.ctx.page.get(s.ctx.value)
              vi.advanceTimersByTime(60)
              const afterFirstWindow = s.ctx.starts()
              vi.advanceTimersByTime(100)
              s.ctx.page.get(s.ctx.value)
              const afterSecondWindow = s.ctx.starts()
              vi.useRealTimers()
              return { afterFirstWindow, afterSecondWindow }
            }),
        ),
        Then('the value survived the first window and was swept only after being left alone')((s) => {
          expect(s.readings.afterFirstWindow).toBe(1)
          expect(s.readings.afterSecondWindow).toBe(2)
        }),
      ),
    )
    scenario(
      'A value mounted for a lifetime is released when that lifetime closes',
      Gherkin.Do.pipe(
        Given('a value mounted for a bounded lifetime')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(1)
            const page = Registry.make()
            return { page, value }
          })),
        When('the lifetime closes')('nodes', (s) =>
          Effect.gen(function*() {
            yield* Effect.scoped(Registry.mount(s.ctx.page, s.ctx.value))
            yield* Effect.yieldNow
            const keys = new Set(s.ctx.page.getNodes().keys())
            return { hasValue: keys.has(s.ctx.value) }
          })),
        Then('the value is gone')((s) => {
          expect(s.nodes.hasValue).toBe(false)
        }),
      ),
    )
    scenario(
      'A stream of a value emits the current value first, then every change until it is released',
      Gherkin.Do.pipe(
        Given('a value that changes over time')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(1)
            const page = Registry.make()
            return { page, value }
          })),
        When('a stream of the value is collected while it changes, then released')(
          'heard',
          (s) =>
            Effect.gen(function*() {
              const heard: number[] = []
              const first = Latch.makeUnsafe()
              const second = Latch.makeUnsafe()
              const fiber = yield* Effect.forkChild(
                Effect.scoped(
                  Stream.runForEach(Registry.toStream(s.ctx.page, s.ctx.value), (n) =>
                    Effect.sync(() => {
                      heard.push(n)
                      if (heard.length === 1) first.openUnsafe()
                      if (n === 2) second.openUnsafe()
                    })),
                ),
              )
              yield* first.await
              s.ctx.page.set(s.ctx.value, 2)
              yield* second.await
              yield* Fiber.interrupt(fiber)
              return { heard }
            }),
        ),
        Then('the stream delivered the current value first and then the change')((s) => {
          expect(s.heard.heard).toEqual([1, 2])
        }),
      ),
    )
    scenario(
      'A stream of settled results skips the loading state, deduplicates, and fails when the result fails',
      Gherkin.Do.pipe(
        Given('a result that loads, settles, repeats, and finally fails')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make<Result.Result<number, string>>(Result.initial(false))
            const page = Registry.make()
            return { page, value }
          })),
        When('a stream of the settled results is collected through all of its states')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const heard: number[] = []
              const first = Latch.makeUnsafe()
              const second = Latch.makeUnsafe()
              const fiber = yield* Effect.forkChild(
                Effect.scoped(
                  Stream.runForEach(Registry.toStreamResult(s.ctx.page, s.ctx.value), (n) =>
                    Effect.sync(() => {
                      heard.push(n)
                      if (heard.length === 1) first.openUnsafe()
                      if (n === 2) second.openUnsafe()
                    })),
                ),
              )
              yield* Effect.yieldNow
              s.ctx.page.set(s.ctx.value, Result.success(1))
              yield* first.await
              s.ctx.page.set(s.ctx.value, Result.success(2))
              yield* second.await
              s.ctx.page.set(s.ctx.value, Result.success(2))
              yield* Effect.yieldNow
              const afterDuplicate = heard.length
              s.ctx.page.set(s.ctx.value, Result.failure<number, string>(Cause.fail('boom')))
              const exit = yield* Effect.exit(Fiber.join(fiber))
              return { heard, afterDuplicate, exit }
            }),
        ),
        Then('the loading state was skipped, duplicates were dropped, and the failure surfaced')(
          (s) => {
            expect(s.outcome.heard).toEqual([1, 2])
            expect(s.outcome.afterDuplicate).toBe(2)
            expect(Exit.isFailure(s.outcome.exit)).toBe(true)
          },
        ),
      ),
    )
    scenario(
      'A stream of a failed result fails right away',
      Gherkin.Do.pipe(
        Given('a result that is already failed')('ctx', () =>
          Effect.sync(() => {
            const failing = Atom.make<Result.Result<number, string>>(Result.failure<number, string>(Cause.fail('boom')))
            const page = Registry.make()
            return { page, failing }
          })),
        When('a stream of its settled values is collected')('outcome', (s) =>
          Effect.gen(function*() {
            const fiber = yield* Effect.forkChild(
              Effect.scoped(Stream.runCollect(Registry.toStreamResult(s.ctx.page, s.ctx.failing))),
            )
            const exit = yield* Effect.exit(Fiber.join(fiber))
            return { exit }
          })),
        Then('the stream failed immediately with the failure')((s) => {
          expect(Exit.isFailure(s.outcome.exit)).toBe(true)
        }),
      ),
    )
    scenario(
      'A stream created through a value reads settled results and failures',
      Gherkin.Do.pipe(
        Given('a value that exposes streams of a settled and of a failed result')('ctx', () =>
          Effect.sync(() => {
            const successResult = Atom.make<Result.Result<number, never>>(Result.success(3))
            const failureResult = Atom.make<Result.Result<number, string>>(
              Result.failure<number, string>(Cause.fail('boom')),
            )
            const successStream = Atom.keepAlive(Atom.readable((get) => get.streamResult(successResult)))
            const failureStream = Atom.keepAlive(Atom.readable((get) => get.streamResult(failureResult)))
            const page = Registry.make()
            return { page, successStream, failureStream }
          })),
        When('both streams are collected')('outcome', (s) =>
          Effect.gen(function*() {
            const heard: number[] = []
            const got = Latch.makeUnsafe()
            const successFiber = yield* Effect.forkChild(
              Effect.scoped(
                Stream.runForEach(s.ctx.page.get(s.ctx.successStream), (n) =>
                  Effect.sync(() => {
                    heard.push(n)
                    got.openUnsafe()
                  })),
              ),
            )
            yield* got.await
            yield* Fiber.interrupt(successFiber)
            const failureFiber = yield* Effect.forkChild(
              Effect.scoped(Stream.runCollect(s.ctx.page.get(s.ctx.failureStream))),
            )
            const exit = yield* Effect.exit(Fiber.join(failureFiber))
            return { chunk: heard, exit }
          })),
        Then('the settled stream delivered its value and the failed one failed')((s) => {
          expect(s.outcome.chunk).toEqual([3])
          expect(Exit.isFailure(s.outcome.exit)).toBe(true)
        }),
      ),
    )
    scenario(
      'A reader asking for a settled answer hears it immediately when one is already available',
      Gherkin.Do.pipe(
        Given('a result that already holds a settled value')('ctx', () =>
          Effect.sync(() => {
            const settled = Atom.make<Result.Result<number, never>>(Result.success(10))
            const page = Registry.make()
            return { page, settled }
          })),
        When('a reader asks for the settled answer')('answer', (s) =>
          Effect.gen(function*() {
            const immediate = yield* Registry.getResult(s.ctx.page, s.ctx.settled)
            return { immediate }
          })),
        Then('the reader heard the settled value without waiting')((s) => {
          expect(s.answer.immediate).toBe(10)
        }),
      ),
    )
    scenario(
      'A reader asking for a settled answer waits through loading and waiting states until a final value arrives',
      Gherkin.Do.pipe(
        Given('three results in the loading state')('ctx', () =>
          Effect.sync(() => {
            const loading = Atom.make<Result.Result<number, never>>(Result.initial(false))
            const waiting = Atom.make<Result.Result<number, never>>(Result.initial(false))
            const flickering = Atom.make<Result.Result<number, never>>(Result.initial(false))
            const page = Registry.make()
            return { page, loading, waiting, flickering }
          })),
        When('readers ask for settled answers while each result settles in turn')(
          'answers',
          (s) =>
            Effect.gen(function*() {
              const fromLoading = Effect.runFork(Registry.getResult(s.ctx.page, s.ctx.loading))
              s.ctx.page.set(s.ctx.loading, Result.success(20))
              const waited = yield* Fiber.join(fromLoading)
              const fromWaiting = Effect.runFork(
                Registry.getResult(s.ctx.page, s.ctx.waiting, { suspendOnWaiting: true }),
              )
              s.ctx.page.set(s.ctx.waiting, Result.success(1, { waiting: true }))
              s.ctx.page.set(s.ctx.waiting, Result.success(2))
              const waitedThrough = yield* Fiber.join(fromWaiting)
              const fromFlicker = Effect.runFork(Registry.getResult(s.ctx.page, s.ctx.flickering))
              s.ctx.page.set(s.ctx.flickering, Result.initial(true))
              s.ctx.page.set(s.ctx.flickering, Result.success(30))
              const waitedPastFlicker = yield* Fiber.join(fromFlicker)
              return { waited, waitedThrough, waitedPastFlicker }
            }),
        ),
        Then('every reader waited only for the final settled value')((s) => {
          expect(s.answers.waited).toBe(20)
          expect(s.answers.waitedThrough).toBe(2)
          expect(s.answers.waitedPastFlicker).toBe(30)
        }),
      ),
    )
    scenario(
      'A listener hears only the final value when several writes happen inside one batch',
      Gherkin.Do.pipe(
        Given('a value with a listener attached')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(1)
            const page = Registry.make()
            return { page, value }
          })),
        When('several writes happen inside one batch')('heard', (s) =>
          Effect.sync(() => {
            const heard: number[] = []
            s.ctx.page.subscribe(s.ctx.value, (v) => heard.push(v))
            Registry.batch(() => {
              s.ctx.page.set(s.ctx.value, 2)
              s.ctx.page.set(s.ctx.value, 3)
              s.ctx.page.set(s.ctx.value, 4)
            })
            return { heard }
          })),
        Then('the listener heard only the final value once')((s) => {
          expect(s.heard.heard).toEqual([4])
        }),
      ),
    )
    scenario(
      'A value that invalidates itself while building inside a batch is rebuilt once and settles on the new value',
      Gherkin.Do.pipe(
        Given('a value whose first build writes to the source it reads')('ctx', () =>
          Effect.sync(() => {
            const source = Atom.make(0)
            let firstBuild = true
            const selfInvalidating = Atom.readable((get) => {
              const s = get(source)
              if (firstBuild) {
                firstBuild = false
                get.set(source, s + 1)
              }
              return s
            })
            const page = Registry.make()
            return { page, selfInvalidating }
          })),
        When('the value is built inside a batch')('result', (s) =>
          Effect.sync(() => {
            Registry.batch(() => {
              s.ctx.page.get(s.ctx.selfInvalidating)
            })
            return { value: s.ctx.page.get(s.ctx.selfInvalidating) }
          })),
        Then('the value was rebuilt once and settled on the newer source value')((s) => {
          expect(s.result.value).toBe(1)
        }),
      ),
    )
    scenario(
      'A batch that invalidates both a value and its source rebuilds the source first',
      Gherkin.Do.pipe(
        Given('a value derived from a source')('ctx', () =>
          Effect.sync(() => {
            const source = Atom.make(1)
            const derived = Atom.readable((get) => get(source))
            const page = Registry.make()
            return { page, source, derived }
          })),
        When('both are refreshed inside one batch')('result', (s) =>
          Effect.sync(() => {
            s.ctx.page.get(s.ctx.source)
            s.ctx.page.get(s.ctx.derived)
            Registry.batch(() => {
              s.ctx.page.refresh(s.ctx.derived)
              s.ctx.page.refresh(s.ctx.source)
            })
            return {
              source: s.ctx.page.get(s.ctx.source),
              derived: s.ctx.page.get(s.ctx.derived),
            }
          })),
        Then('both were rebuilt in dependency order and kept their values')((s) => {
          expect(s.result.source).toBe(1)
          expect(s.result.derived).toBe(1)
        }),
      ),
    )
    scenario(
      'A value that refreshes itself while building inside a batch is rebuilt once',
      Gherkin.Do.pipe(
        Given('a value whose first build refreshes itself')('ctx', () =>
          Effect.sync(() => {
            const source = Atom.make(0)
            let firstBuild = true
            const selfRefreshing = Atom.readable((get) => {
              const s = get(source)
              if (firstBuild) {
                firstBuild = false
                get.refreshSelf()
              }
              return s
            })
            const page = Registry.make()
            return { page, source, selfRefreshing }
          })),
        When('the value is built inside a batch')('result', (s) =>
          Effect.sync(() => {
            Registry.batch(() => {
              s.ctx.page.get(s.ctx.selfRefreshing)
            })
            return { value: s.ctx.page.get(s.ctx.selfRefreshing) }
          })),
        Then('the refresh happened without leaving the value behind')((s) => {
          expect(s.result.value).toBe(0)
        }),
      ),
    )
    scenario(
      'A preloaded value is announced to listeners and kept as the first value',
      Gherkin.Do.pipe(
        Given('a value with a listener attached but no value yet')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(1)
            const page = Registry.make()
            return { page, value }
          })),
        When('an initial value is set before the value is ever read')('result', (s) =>
          Effect.sync(() => {
            const heard: number[] = []
            s.ctx.page.subscribe(s.ctx.value, (v) => heard.push(v))
            s.ctx.page.setInitialValue(s.ctx.value, 10)
            return { heard, read: s.ctx.page.get(s.ctx.value) }
          })),
        Then('the listener heard the preloaded value and the first read returned it')((s) => {
          expect(s.result.heard).toEqual([10])
          expect(s.result.read).toBe(10)
        }),
      ),
    )
    scenario(
      'Setting a new initial value on an already-built value replaces it',
      Gherkin.Do.pipe(
        Given('a value that has already been read')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(1)
            const page = Registry.make()
            return { page, value }
          })),
        When('a new initial value is set on the built value')('result', (s) =>
          Effect.sync(() => {
            s.ctx.page.get(s.ctx.value)
            s.ctx.page.setInitialValue(s.ctx.value, 7)
            return { read: s.ctx.page.get(s.ctx.value) }
          })),
        Then('the built value now holds the new initial value')((s) => {
          expect(s.result.read).toBe(7)
        }),
      ),
    )
    scenario(
      'Setting an initial value inside a batch still announces it',
      Gherkin.Do.pipe(
        Given('a value that has never been read')('ctx', () =>
          Effect.sync(() => {
            const fresh = Atom.make(2)
            const page = Registry.make()
            return { page, fresh }
          })),
        When('an initial value is set for it inside a batch')('result', (s) =>
          Effect.sync(() => {
            Registry.batch(() => {
              s.ctx.page.setInitialValue(s.ctx.fresh, 5)
            })
            return { read: s.ctx.page.get(s.ctx.fresh) }
          })),
        Then('the value kept the initial value set inside the batch')((s) => {
          expect(s.result.read).toBe(5)
        }),
      ),
    )
    scenario(
      'Setting an initial value on a derived value routes it to its source',
      Gherkin.Do.pipe(
        Given('a derived value that stores its initial value on its source')('ctx', () =>
          Effect.sync(() => {
            const source = Atom.make(1)
            const derived = Atom.transform(source, (get) => get(source), { initialValueTarget: source })
            const page = Registry.make()
            return { page, source, derived }
          })),
        When('an initial value is set on the derived value')('result', (s) =>
          Effect.sync(() => {
            s.ctx.page.setInitialValue(s.ctx.derived, 7)
            return {
              derived: s.ctx.page.get(s.ctx.derived),
              source: s.ctx.page.get(s.ctx.source),
            }
          })),
        Then('the initial value was routed through to the source and flowed back')((s) => {
          expect(s.result.derived).toBe(7)
          expect(s.result.source).toBe(7)
        }),
      ),
    )
    scenario(
      'A stored serializable value is applied directly when the value already exists',
      Gherkin.Do.pipe(
        Given('a serializable value that has already been read')('ctx', () =>
          Effect.sync(() => {
            const direct = Atom.make(2).pipe(Atom.serializable({ key: 'direct-key', schema: Schema.Number }))
            const page = Registry.make()
            return { page, direct }
          })),
        When('a stored value arrives for it')('result', (s) =>
          Effect.sync(() => {
            s.ctx.page.get(s.ctx.direct)
            s.ctx.page.setSerializable('direct-key', 9)
            return { read: s.ctx.page.get(s.ctx.direct) }
          })),
        Then('the existing value was replaced by the stored one')((s) => {
          expect(s.result.read).toBe(9)
        }),
      ),
    )
    scenario(
      'A stored serializable value is routed to the source when the value is derived',
      Gherkin.Do.pipe(
        Given('a derived value that stores its initial value on its source')('ctx', () =>
          Effect.sync(() => {
            const source = Atom.make(1)
            const derived = Atom.transform(source, (get) => get(source), { initialValueTarget: source }).pipe(
              Atom.serializable({ key: 'derived-key', schema: Schema.Number }),
            )
            const page = Registry.make()
            return { page, source, derived }
          })),
        When('a stored value arrives before the derived value is ever read')('result', (s) =>
          Effect.sync(() => {
            s.ctx.page.setSerializable('derived-key', 7)
            return {
              derived: s.ctx.page.get(s.ctx.derived),
              source: s.ctx.page.get(s.ctx.source),
            }
          })),
        Then('the stored value became the source initial value and flowed through')((s) => {
          expect(s.result.derived).toBe(7)
          expect(s.result.source).toBe(7)
        }),
      ),
    )
    scenario(
      'A stored serializable value is applied even before the value is ever read, and refreshing it rebuilds it from its definition',
      Gherkin.Do.pipe(
        Given('a serializable value that has a listener but has never been read')('ctx', () =>
          Effect.sync(() => {
            const direct = Atom.make(2).pipe(Atom.serializable({ key: 'unread-key', schema: Schema.Number }))
            const page = Registry.make()
            return { page, direct }
          })),
        When('a stored value arrives and the value is then refreshed')('result', (s) =>
          Effect.sync(() => {
            s.ctx.page.subscribe(s.ctx.direct, () => {})
            s.ctx.page.setSerializable('unread-key', 9)
            const stored = s.ctx.page.get(s.ctx.direct)
            s.ctx.page.refresh(s.ctx.direct)
            const rebuilt = s.ctx.page.get(s.ctx.direct)
            return { stored, rebuilt }
          })),
        Then('the stored value was applied to the never-read value and then rebuilt from its definition')((s) => {
          expect(s.result.stored).toBe(9)
          expect(s.result.rebuilt).toBe(2)
        }),
      ),
    )
    scenario(
      'A registry provided by the default layer serves values and honors preloaded options',
      Gherkin.Do.pipe(
        Given('two values')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(1)
            const other = Atom.make(2)
            return { value, other }
          })),
        When('the service layer provides a registry, one with a preloaded value')(
          'reads',
          (s) =>
            Effect.gen(function*() {
              const defaultRead = yield* Effect.provide(Registry.layer)(
                Effect.gen(function*() {
                  const registry = yield* Registry.AtomRegistry
                  return registry.get(s.ctx.value)
                }),
              )
              const preloadedRead = yield* Effect.provide(Registry.layerOptions({ initialValues: [[s.ctx.other, 9]] }))(
                Effect.gen(function*() {
                  const registry = yield* Registry.AtomRegistry
                  return registry.get(s.ctx.other)
                }),
              )
              return { defaultRead, preloadedRead }
            }),
        ),
        Then('both reads went through the provided registries')((s) => {
          expect(s.reads.defaultRead).toBe(1)
          expect(s.reads.preloadedRead).toBe(9)
        }),
      ),
    )
    scenario(
      'A disposed registry refuses to create nodes',
      Gherkin.Do.pipe(
        Given('a registry holding a value')('ctx', () =>
          Effect.sync(() => {
            const page = Registry.make()
            const value = Atom.make(1)
            page.get(value)
            return { page }
          })),
        When('the registry is disposed and a new value is read through it')('result', (s) =>
          Effect.sync(() => {
            s.ctx.page.dispose()
            const remaining = s.ctx.page.getNodes().size
            let message: string | undefined
            try {
              s.ctx.page.get(Atom.make(2))
            } catch (error) {
              message = error instanceof Error
                ? error.message
                : typeof error === 'string'
                ? error
                : JSON.stringify(error)
            }
            return { remaining, message }
          })),
        Then('the registry is empty and reading through it throws')((s) => {
          expect(s.result.remaining).toBe(0)
          expect(s.result.message).toContain('disposed')
        }),
      ),
    )
    scenario(
      'When a child is swept, its idle parent is swept in the same pass instead of waiting for a new window',
      Gherkin.Do.pipe(
        Given('a value derived from a source, both idle on one cleanup schedule')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            const source = Atom.make(1)
            const derived = Atom.readable((get) => get(source))
            const page = Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
            return { page, source, derived }
          })),
        When('both fall idle and the shared cleanup timer runs')('result', (s) =>
          Effect.sync(() => {
            s.ctx.page.get(s.ctx.derived)
            const maybeNode = s.ctx.page.getNodes().get(s.ctx.derived)
            if (maybeNode === undefined) {
              throw new Error('expected a node after reading the value')
            }
            const node = maybeNode
            const before = node.currentState()
            vi.advanceTimersByTime(100)
            const keys = new Set(s.ctx.page.getNodes().keys())
            const after = node.currentState()
            vi.useRealTimers()
            return {
              before,
              after,
              hasDerived: keys.has(s.ctx.derived),
              hasSource: keys.has(s.ctx.source),
            }
          })),
        Then('the source was swept in the same pass right after the derived value')((s) => {
          expect(s.result.before).toBe('valid')
          expect(s.result.after).toBe('removed')
          expect(s.result.hasDerived).toBe(false)
          expect(s.result.hasSource).toBe(false)
        }),
      ),
    )
    scenario(
      'A parent that is still in use survives the sweep that removes its child',
      Gherkin.Do.pipe(
        Given('a source with a listener, and a derived value that reads it')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            const source = Atom.make(1)
            const derived = Atom.readable((get) => get(source))
            const page = Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
            return { page, source, derived }
          })),
        When('both fall idle while the source is still listened to, and the cleanup timer runs')(
          'result',
          (s) =>
            Effect.sync(() => {
              s.ctx.page.get(s.ctx.derived)
              s.ctx.page.subscribe(s.ctx.source, () => {})
              vi.advanceTimersByTime(100)
              const keys = new Set(s.ctx.page.getNodes().keys())
              vi.useRealTimers()
              return {
                hasDerived: keys.has(s.ctx.derived),
                hasSource: keys.has(s.ctx.source),
              }
            }),
        ),
        Then('the derived value is gone while the source stays because someone still listens')((s) => {
          expect(s.result.hasDerived).toBe(false)
          expect(s.result.hasSource).toBe(true)
        }),
      ),
    )
    scenario(
      'A parent with a longer cleanup schedule is swept in its own window after its child',
      Gherkin.Do.pipe(
        Given('a value derived from a source that keeps its value twice as long')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            const source = Atom.setIdleTTL(20)(Atom.make(1))
            const derived = Atom.readable((get) => get(source))
            const page = Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
            return { page, source, derived }
          })),
        When('both fall idle and the cleanup timers run past both windows')('result', (s) =>
          Effect.sync(() => {
            s.ctx.page.get(s.ctx.derived)
            vi.advanceTimersByTime(15)
            const afterFirstWindow = new Set(s.ctx.page.getNodes().keys())
            vi.advanceTimersByTime(100)
            const afterSecondWindow = new Set(s.ctx.page.getNodes().keys())
            vi.useRealTimers()
            return {
              hasDerivedAfterFirst: afterFirstWindow.has(s.ctx.derived),
              hasSourceAfterFirst: afterFirstWindow.has(s.ctx.source),
              hasSourceAfterSecond: afterSecondWindow.has(s.ctx.source),
            }
          })),
        Then('the child is swept first and the parent is swept in its own later window')((s) => {
          expect(s.result.hasDerivedAfterFirst).toBe(false)
          expect(s.result.hasSourceAfterFirst).toBe(true)
          expect(s.result.hasSourceAfterSecond).toBe(false)
        }),
      ),
    )
    scenario(
      'Re-reading values before their cleanup window removes their pending timers',
      Gherkin.Do.pipe(
        Given('two values sharing one cleanup window')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            const first = Atom.make(1)
            const second = Atom.make(2)
            const page = Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
            return { page, first, second }
          })),
        When('both fall idle and are read again before their window')('result', (s) =>
          Effect.sync(() => {
            s.ctx.page.get(s.ctx.first)
            s.ctx.page.get(s.ctx.second)
            vi.advanceTimersByTime(1)
            s.ctx.page.get(s.ctx.first)
            s.ctx.page.get(s.ctx.second)
            vi.advanceTimersByTime(100)
            const keys = new Set(s.ctx.page.getNodes().keys())
            vi.useRealTimers()
            return { hasFirst: keys.has(s.ctx.first), hasSecond: keys.has(s.ctx.second) }
          })),
        Then('both are swept only after being left alone again')((s) => {
          expect(s.result.hasFirst).toBe(false)
          expect(s.result.hasSecond).toBe(false)
        }),
      ),
    )
    scenario(
      'Unsubscribing from a value that was never read removes it entirely',
      Gherkin.Do.pipe(
        Given('a value in a plain registry')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(1)
            const page = Registry.make()
            return { page, value }
          })),
        When('a listener attaches without reading, then releases')('result', (s) =>
          Effect.gen(function*() {
            const cancel = s.ctx.page.subscribe(s.ctx.value, () => {})
            const maybeNode = s.ctx.page.getNodes().get(s.ctx.value)
            if (maybeNode === undefined) {
              throw new Error('expected a node after the value was touched')
            }
            const before = maybeNode.currentState()
            cancel()
            yield* Effect.yieldNow
            const keys = new Set(s.ctx.page.getNodes().keys())
            return { before, hasValue: keys.has(s.ctx.value) }
          })),
        Then('the never-built value was removed once the listener left')((s) => {
          expect(s.result.before).toBe('uninitialized')
          expect(s.result.hasValue).toBe(false)
        }),
      ),
    )
    scenario(
      'A lazy value with an active child rebuilds when refreshed',
      Gherkin.Do.pipe(
        Given('a lazy value with a child that is not lazy')('ctx', () =>
          Effect.sync(() => {
            const source = Atom.make(1)
            const root = Atom.readable((get) => get(source))
            const activeChild = Atom.setLazy(false)(Atom.readable((get) => get(root)))
            const page = Registry.make()
            return { page, source, root, activeChild }
          })),
        When('the lazy value is refreshed while its child is active')('result', (s) =>
          Effect.sync(() => {
            s.ctx.page.get(s.ctx.root)
            s.ctx.page.get(s.ctx.activeChild)
            const maybeNode = s.ctx.page.getNodes().get(s.ctx.root)
            if (maybeNode === undefined) {
              throw new Error('expected a node after reading the value')
            }
            const node = maybeNode
            s.ctx.page.refresh(s.ctx.root)
            return { state: node.currentState(), value: s.ctx.page.get(s.ctx.root) }
          })),
        Then('the lazy value rebuilt immediately')((s) => {
          expect(s.result.state).toBe('valid')
          expect(s.result.value).toBe(1)
        }),
      ),
    )
    scenario(
      'A lazy value with only inactive descendants stays stale until read again and forgets the skipped invalidation once a new child appears',
      Gherkin.Do.pipe(
        Given('a chain of lazy values with a shared root')('ctx', () =>
          Effect.sync(() => {
            const source = Atom.make(1)
            const root = Atom.readable((get) => get(source))
            const left = Atom.readable((get) => get(root))
            const right = Atom.readable((get) => get(root))
            const leftChild = Atom.readable((get) => get(left))
            const rightChild = Atom.readable((get) => get(right))
            const page = Registry.make()
            return { page, source, root, left, right, leftChild, rightChild }
          })),
        When('the root is refreshed while nothing listens, then a new value starts reading it')(
          'result',
          (s) =>
            Effect.sync(() => {
              s.ctx.page.get(s.ctx.root)
              s.ctx.page.get(s.ctx.left)
              s.ctx.page.get(s.ctx.right)
              s.ctx.page.get(s.ctx.leftChild)
              s.ctx.page.get(s.ctx.rightChild)
              const maybeNode = s.ctx.page.getNodes().get(s.ctx.root)
              if (maybeNode === undefined) {
                throw new Error('expected a node after reading the value')
              }
              const node = maybeNode
              s.ctx.page.refresh(s.ctx.root)
              const afterRefresh = node.currentState()
              const newcomer = Atom.readable((get) => get(s.ctx.root))
              s.ctx.page.get(newcomer)
              return {
                afterRefresh,
                finalState: node.currentState(),
                value: s.ctx.page.get(s.ctx.root),
              }
            }),
        ),
        Then('the root stayed stale until a new reader came, then rebuilt and cleared the skipped invalidation')(
          (s) => {
            expect(s.result.afterRefresh).toBe('stale')
            expect(s.result.finalState).toBe('valid')
            expect(s.result.value).toBe(1)
          },
        ),
      ),
    )
    scenario(
      'A derived value that stops following a source leaves the source alone while someone still listens',
      Gherkin.Do.pipe(
        Given('a source that someone still listens to, and a derived value that can switch away')(
          'ctx',
          () =>
            Effect.sync(() => {
              const first = Atom.make(1)
              const second = Atom.make(2)
              let useFirst = true
              const switching = Atom.readable((get) => get(useFirst ? first : second))
              const page = Registry.make()
              return {
                page,
                first,
                second,
                switching,
                flip: () => {
                  useFirst = false
                },
              }
            }),
        ),
        When('the derived value switches sources')('nodes', (s) =>
          Effect.sync(() => {
            s.ctx.page.subscribe(s.ctx.first, () => {})
            s.ctx.page.get(s.ctx.switching)
            s.ctx.flip()
            s.ctx.page.refresh(s.ctx.switching)
            const value = s.ctx.page.get(s.ctx.switching)
            const keys = new Set(s.ctx.page.getNodes().keys())
            return {
              value,
              hasFirst: keys.has(s.ctx.first),
              hasSecond: keys.has(s.ctx.second),
            }
          })),
        Then('the abandoned source is kept because it is still in use, and the new one is followed')((s) => {
          expect(s.nodes.value).toBe(2)
          expect(s.nodes.hasFirst).toBe(true)
          expect(s.nodes.hasSecond).toBe(true)
        }),
      ),
    )
    scenario(
      'Work scheduled by a value stops when the value is invalidated',
      Gherkin.Do.pipe(
        Given('a value that schedules several kinds of work for its lifetime')('ctx', () =>
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
            const fibers: Fiber.Fiber<number, never>[] = []
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
                get.stream(plain)
              })
              get.addFinalizer(() => {
                get.setResult(resultWritable, Result.success(4))
              })
              get.addFinalizer(() => {
                get.result(failed)
              })
              get.addFinalizer(() => {
                get.some(noOption)
              })
              get.addFinalizer(() => {
                get.addFinalizer(() => {})
              })
              return get.get(source)
            }))
            return { registry, value, loading, waiting, noOption, fibers }
          })),
        When('the value is built, its pending results settle, and the value is then invalidated')(
          'result',
          (s) =>
            Effect.gen(function*() {
              s.ctx.registry.get(s.ctx.value)
              yield* Effect.yieldNow
              s.ctx.registry.set(s.ctx.loading, Result.initial(false))
              s.ctx.registry.set(s.ctx.loading, Result.success(7))
              s.ctx.registry.set(s.ctx.waiting, Result.success(2, { waiting: true }))
              s.ctx.registry.set(s.ctx.waiting, Result.success(3))
              s.ctx.registry.set(s.ctx.noOption, Option.some(5))
              const settledValue = yield* Fiber.join(s.ctx.fibers[0])
              const resumedValue = yield* Fiber.join(s.ctx.fibers[1])
              const optionValue = yield* Fiber.join(s.ctx.fibers[2])
              const throughWaiting = yield* Fiber.join(s.ctx.fibers[3])
              const throughNone = yield* Fiber.join(s.ctx.fibers[4])
              s.ctx.registry.refresh(s.ctx.value)
              const maybeNode = s.ctx.registry.getNodes().get(s.ctx.value)
              if (maybeNode === undefined) {
                throw new Error('expected a node after reading the value')
              }
              const node = maybeNode
              return {
                settledValue,
                resumedValue,
                optionValue,
                throughWaiting,
                throughNone,
                state: node.currentState(),
              }
            }),
        ),
        Then('the forked reads settled and the invalidated value stopped all scheduled work')((s) => {
          expect(s.result.settledValue).toBe(5)
          expect(s.result.resumedValue).toBe(7)
          expect(s.result.optionValue).toBe(1)
          expect(s.result.throughWaiting).toBe(3)
          expect(s.result.throughNone).toBe(5)
          expect(s.result.state).toBe('stale')
        }),
      ),
    )
  })
