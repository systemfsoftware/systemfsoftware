import { expect } from '@effect/vitest'
import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Context, Effect, Exit, Fiber, HashSet, Latch, Layer, Option, Schema, Scope, Stream } from 'effect'
import { vi } from 'vitest'

const Feature = makeFeature({ it, layer })

/** Whether a reading has not settled: nothing has arrived yet, or a refresh is still in flight. */
const isLoading = <A, E>(reading: Atom.AsyncResult.Result<A, E>): boolean =>
  Atom.AsyncResult.isInitial(reading) || Atom.AsyncResult.isWaiting(reading)

Feature('Keeping a value that is still loading available to every reader')
  .withLayer(Layer.empty)
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
              const registry = Atom.Registry.make({ defaultIdleTTL: 10 })
              return { registry, atom, timesStarted: () => startCount }
            }),
        ),
        When('two readers check the value while it is still loading, and the cleanup timer runs')(
          'result',
          (s) =>
            Effect.sync(() => {
              const firstReading = Atom.Registry.get(s.setup.registry, s.setup.atom)
              const secondReading = Atom.Registry.get(s.setup.registry, s.setup.atom)
              vi.advanceTimersByTime(100)
              const readingAfterCleanup = Atom.Registry.get(s.setup.registry, s.setup.atom)
              const started = s.setup.timesStarted()
              vi.useRealTimers()
              return { firstReading, secondReading, readingAfterCleanup, started }
            }),
        ),
        Then('the work only ever started once, and every reader still sees it loading')(
          (s) => {
            expect(s.result.started).toBe(1)
            expect(s.result.firstReading).toSatisfy(isLoading)
            expect(s.result.secondReading).toSatisfy(isLoading)
            expect(s.result.readingAfterCleanup).toSatisfy(isLoading)
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
              const registry = Atom.Registry.make({ defaultIdleTTL: 5 })
              return { registry, atom, timesStarted: () => startCount }
            }),
        ),
        When('a reader checks the value and the cleanup timer runs, then checks it again')(
          'res',
          (s) =>
            Effect.sync(() => {
              const firstReading = Atom.Registry.get(s.ctx.registry, s.ctx.atom)
              vi.advanceTimersByTime(100)
              const secondReading = Atom.Registry.get(s.ctx.registry, s.ctx.atom)
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
              const switching = Atom.readable((get) => {
                if (useFirst) {
                  return get(first)
                }
                return get(second)
              }).pipe(Atom.keepAlive)
              const page = Atom.Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
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
            const before = Atom.Registry.get(s.ctx.page, s.ctx.switching)
            s.ctx.flip()
            Atom.Registry.refresh(s.ctx.page, s.ctx.switching)
            const after = Atom.Registry.get(s.ctx.page, s.ctx.switching)
            vi.advanceTimersByTime(100)
            const keys = HashSet.fromIterable(Atom.Registry.getNodes(s.ctx.page).keys())
            vi.useRealTimers()
            return {
              before,
              after,
              hasFirst: HashSet.has(keys, s.ctx.first),
              hasSecond: HashSet.has(keys, s.ctx.second),
            }
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
            const page = Atom.Registry.make()
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
              const first = Atom.Registry.get(s.ctx.page, s.ctx.source)
              s.ctx.setStored(2)
              s.ctx.latch.closeUnsafe()
              Atom.Registry.refresh(s.ctx.page, s.ctx.source)
              const pending = yield* Effect.forkChild(
                Atom.Registry.getResult(s.ctx.page, s.ctx.source, { suspendOnWaiting: true }),
              )
              s.ctx.latch.openUnsafe()
              const settled = yield* Fiber.join(pending)
              return { first, settled }
            }),
        ),
        Then('the reader waited and received the fresh answer')((s) => {
          expect(s.answer.first).toMatchObject({ _tag: 'Success', value: 1 })
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
            const page = Atom.Registry.make()
            Atom.Registry.get(page, value)
            return { page, value }
          })),
        When('a listener attaches asking for the current value immediately')('heard', (s) =>
          Effect.sync(() => {
            const heard: number[] = []
            Atom.Registry.subscribe(s.ctx.page, s.ctx.value, (v) => heard.push(v), { immediate: true })
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
            const page = Atom.Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
            return { page, first, second }
          })),
        When('both are read and the cleanup timer runs')('nodes', (s) =>
          Effect.sync(() => {
            Atom.Registry.get(s.ctx.page, s.ctx.first)
            Atom.Registry.get(s.ctx.page, s.ctx.second)
            vi.advanceTimersByTime(100)
            const keys = HashSet.fromIterable(Atom.Registry.getNodes(s.ctx.page).keys())
            vi.useRealTimers()
            return { hasFirst: HashSet.has(keys, s.ctx.first), hasSecond: HashSet.has(keys, s.ctx.second) }
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
            const page = Atom.Registry.make({ defaultIdleTTL: 100, timeoutResolution: 10 })
            return { page, value, starts: () => starts }
          })),
        When('the value is read again while its cleanup is pending, then left alone')(
          'readings',
          (s) =>
            Effect.sync(() => {
              Atom.Registry.get(s.ctx.page, s.ctx.value)
              vi.advanceTimersByTime(50)
              Atom.Registry.get(s.ctx.page, s.ctx.value)
              vi.advanceTimersByTime(60)
              const afterFirstWindow = s.ctx.starts()
              vi.advanceTimersByTime(100)
              Atom.Registry.get(s.ctx.page, s.ctx.value)
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
            const page = Atom.Registry.make()
            return { page, value }
          })),
        When('the lifetime closes')('nodes', (s) =>
          Effect.gen(function*() {
            yield* Effect.scoped(Atom.Registry.mount(s.ctx.page, s.ctx.value))
            yield* Effect.yieldNow
            const keys = HashSet.fromIterable(Atom.Registry.getNodes(s.ctx.page).keys())
            return { hasValue: HashSet.has(keys, s.ctx.value) }
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
            const page = Atom.Registry.make()
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
                  Stream.runForEach(Atom.Registry.toStream(s.ctx.page, s.ctx.value), (n) =>
                    Effect.sync(() => {
                      heard.push(n)
                      if (heard.length === 1) first.openUnsafe()
                      if (n === 2) second.openUnsafe()
                    })),
                ),
              )
              yield* first.await
              Atom.Registry.set(s.ctx.page, s.ctx.value, 2)
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
            const value = Atom.make<Atom.AsyncResult.Result<number, string>>(Atom.AsyncResult.initial(false))
            const page = Atom.Registry.make()
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
                  Stream.runForEach(Atom.Registry.toStreamResult(s.ctx.page, s.ctx.value), (n) =>
                    Effect.sync(() => {
                      heard.push(n)
                      if (heard.length === 1) first.openUnsafe()
                      if (n === 2) second.openUnsafe()
                    })),
                ),
              )
              yield* Effect.yieldNow
              Atom.Registry.set(s.ctx.page, s.ctx.value, Atom.AsyncResult.success(1))
              yield* first.await
              Atom.Registry.set(s.ctx.page, s.ctx.value, Atom.AsyncResult.success(2))
              yield* second.await
              Atom.Registry.set(s.ctx.page, s.ctx.value, Atom.AsyncResult.success(2))
              yield* Effect.yieldNow
              const afterDuplicate = heard.length
              Atom.Registry.set(s.ctx.page, s.ctx.value, Atom.AsyncResult.failure<number, string>(Cause.fail('boom')))
              const exit = yield* Effect.exit(Fiber.join(fiber))
              return { heard, afterDuplicate, exit }
            }),
        ),
        Then('the loading state was skipped, duplicates were dropped, and the failure surfaced')(
          (s) => {
            expect(s.outcome.heard).toEqual([1, 2])
            expect(s.outcome.afterDuplicate).toBe(2)
            expect(s.outcome.exit).toSatisfy(Exit.isFailure)
          },
        ),
      ),
    )
    scenario(
      'A stream of a failed result fails right away',
      Gherkin.Do.pipe(
        Given('a result that is already failed')('ctx', () =>
          Effect.sync(() => {
            const failing = Atom.make<Atom.AsyncResult.Result<number, string>>(
              Atom.AsyncResult.failure<number, string>(Cause.fail('boom')),
            )
            const page = Atom.Registry.make()
            return { page, failing }
          })),
        When('a stream of its settled values is collected')('outcome', (s) =>
          Effect.gen(function*() {
            const fiber = yield* Effect.forkChild(
              Effect.scoped(Stream.runCollect(Atom.Registry.toStreamResult(s.ctx.page, s.ctx.failing))),
            )
            const exit = yield* Effect.exit(Fiber.join(fiber))
            return { exit }
          })),
        Then('the stream failed immediately with the failure')((s) => {
          expect(s.outcome.exit).toSatisfy(Exit.isFailure)
        }),
      ),
    )
    scenario(
      'A stream created through a value reads settled results and failures',
      Gherkin.Do.pipe(
        Given('a value that exposes streams of a settled and of a failed result')('ctx', () =>
          Effect.sync(() => {
            const successResult = Atom.make<Atom.AsyncResult.Result<number, never>>(Atom.AsyncResult.success(3))
            const failureResult = Atom.make<Atom.AsyncResult.Result<number, string>>(
              Atom.AsyncResult.failure<number, string>(Cause.fail('boom')),
            )
            const successStream = Atom.keepAlive(Atom.readable((get) => get.streamResult(successResult)))
            const failureStream = Atom.keepAlive(Atom.readable((get) => get.streamResult(failureResult)))
            const page = Atom.Registry.make()
            return { page, successStream, failureStream }
          })),
        When('both streams are collected')('outcome', (s) =>
          Effect.gen(function*() {
            const heard: number[] = []
            const got = Latch.makeUnsafe()
            const successFiber = yield* Effect.forkChild(
              Effect.scoped(
                Stream.runForEach(Atom.Registry.get(s.ctx.page, s.ctx.successStream), (n) =>
                  Effect.sync(() => {
                    heard.push(n)
                    got.openUnsafe()
                  })),
              ),
            )
            yield* got.await
            yield* Fiber.interrupt(successFiber)
            const failureFiber = yield* Effect.forkChild(
              Effect.scoped(Stream.runCollect(Atom.Registry.get(s.ctx.page, s.ctx.failureStream))),
            )
            const exit = yield* Effect.exit(Fiber.join(failureFiber))
            return { chunk: heard, exit }
          })),
        Then('the settled stream delivered its value and the failed one failed')((s) => {
          expect(s.outcome.chunk).toEqual([3])
          expect(s.outcome.exit).toSatisfy(Exit.isFailure)
        }),
      ),
    )
    scenario(
      'A reader asking for a settled answer hears it immediately when one is already available',
      Gherkin.Do.pipe(
        Given('a result that already holds a settled value')('ctx', () =>
          Effect.sync(() => {
            const settled = Atom.make<Atom.AsyncResult.Result<number, never>>(Atom.AsyncResult.success(10))
            const page = Atom.Registry.make()
            return { page, settled }
          })),
        When('a reader asks for the settled answer')('answer', (s) =>
          Effect.gen(function*() {
            const immediate = yield* Atom.Registry.getResult(s.ctx.page, s.ctx.settled)
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
            const loading = Atom.make<Atom.AsyncResult.Result<number, never>>(Atom.AsyncResult.initial(false))
            const waiting = Atom.make<Atom.AsyncResult.Result<number, never>>(Atom.AsyncResult.initial(false))
            const flickering = Atom.make<Atom.AsyncResult.Result<number, never>>(Atom.AsyncResult.initial(false))
            const page = Atom.Registry.make()
            return { page, loading, waiting, flickering }
          })),
        When('readers ask for settled answers while each result settles in turn')(
          'answers',
          (s) =>
            Effect.gen(function*() {
              const fromLoading = yield* Effect.forkChild(Atom.Registry.getResult(s.ctx.page, s.ctx.loading))
              yield* Effect.yieldNow
              Atom.Registry.set(s.ctx.page, s.ctx.loading, Atom.AsyncResult.success(20))
              const waited = yield* Fiber.join(fromLoading)
              const fromWaiting = yield* Effect.forkChild(
                Atom.Registry.getResult(s.ctx.page, s.ctx.waiting, { suspendOnWaiting: true }),
              )
              yield* Effect.yieldNow
              Atom.Registry.set(s.ctx.page, s.ctx.waiting, Atom.AsyncResult.successWith(1, { waiting: true }))
              Atom.Registry.set(s.ctx.page, s.ctx.waiting, Atom.AsyncResult.success(2))
              const waitedThrough = yield* Fiber.join(fromWaiting)
              const fromFlicker = yield* Effect.forkChild(Atom.Registry.getResult(s.ctx.page, s.ctx.flickering))
              yield* Effect.yieldNow
              Atom.Registry.set(s.ctx.page, s.ctx.flickering, Atom.AsyncResult.initial(true))
              Atom.Registry.set(s.ctx.page, s.ctx.flickering, Atom.AsyncResult.success(30))
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
            const page = Atom.Registry.make()
            return { page, value }
          })),
        When('several writes happen inside one batch')('heard', (s) =>
          Effect.sync(() => {
            const heard: number[] = []
            Atom.Registry.subscribe(s.ctx.page, s.ctx.value, (v) => heard.push(v))
            Atom.Registry.batch(s.ctx.page, () => {
              Atom.Registry.set(s.ctx.page, s.ctx.value, 2)
              Atom.Registry.set(s.ctx.page, s.ctx.value, 3)
              Atom.Registry.set(s.ctx.page, s.ctx.value, 4)
            })
            return { heard }
          })),
        Then('the listener heard only the final value once')((s) => {
          expect(s.heard.heard).toEqual([4])
        }),
      ),
    )
    scenario(
      'A write in a second registry is announced immediately while the first registry is inside a batch',
      Gherkin.Do.pipe(
        Given('two separate registries holding the same value, with a listener on the second')(
          'ctx',
          () =>
            Effect.sync(() => {
              const batching = Atom.Registry.make()
              const listening = Atom.Registry.make()
              const value = Atom.make(1)
              return { batching, listening, value }
            }),
        ),
        When('the first registry runs a batch that writes to a value held by the second registry')(
          'heard',
          (s) =>
            Effect.sync(() => {
              const heard: number[] = []
              const heardWhileBatching: number[][] = []
              Atom.Registry.subscribe(s.ctx.listening, s.ctx.value, (v) => heard.push(v))
              Atom.Registry.batch(s.ctx.batching, () => {
                Atom.Registry.set(s.ctx.listening, s.ctx.value, 2)
                heardWhileBatching.push([...heard])
              })
              return { heard, heardWhileBatching }
            }),
        ),
        Then('the listener on the second registry heard the new value before that batch finished, and only once')(
          (s) => {
            expect(s.heard.heardWhileBatching).toEqual([[2]])
            expect(s.heard.heard).toEqual([2])
          },
        ),
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
            const page = Atom.Registry.make()
            return { page, selfInvalidating }
          })),
        When('the value is built inside a batch')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.batch(s.ctx.page, () => {
              Atom.Registry.get(s.ctx.page, s.ctx.selfInvalidating)
            })
            return { value: Atom.Registry.get(s.ctx.page, s.ctx.selfInvalidating) }
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
            const page = Atom.Registry.make()
            return { page, source, derived }
          })),
        When('both are refreshed inside one batch')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.get(s.ctx.page, s.ctx.source)
            Atom.Registry.get(s.ctx.page, s.ctx.derived)
            Atom.Registry.batch(s.ctx.page, () => {
              Atom.Registry.refresh(s.ctx.page, s.ctx.derived)
              Atom.Registry.refresh(s.ctx.page, s.ctx.source)
            })
            return {
              source: Atom.Registry.get(s.ctx.page, s.ctx.source),
              derived: Atom.Registry.get(s.ctx.page, s.ctx.derived),
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
            const page = Atom.Registry.make()
            return { page, source, selfRefreshing }
          })),
        When('the value is built inside a batch')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.batch(s.ctx.page, () => {
              Atom.Registry.get(s.ctx.page, s.ctx.selfRefreshing)
            })
            return { value: Atom.Registry.get(s.ctx.page, s.ctx.selfRefreshing) }
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
            const page = Atom.Registry.make()
            return { page, value }
          })),
        When('an initial value is set before the value is ever read')('result', (s) =>
          Effect.sync(() => {
            const heard: number[] = []
            Atom.Registry.subscribe(s.ctx.page, s.ctx.value, (v) => heard.push(v))
            Atom.Registry.setInitialValue(s.ctx.page, s.ctx.value, 10)
            return { heard, read: Atom.Registry.get(s.ctx.page, s.ctx.value) }
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
            const page = Atom.Registry.make()
            return { page, value }
          })),
        When('a new initial value is set on the built value')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.get(s.ctx.page, s.ctx.value)
            Atom.Registry.setInitialValue(s.ctx.page, s.ctx.value, 7)
            return { read: Atom.Registry.get(s.ctx.page, s.ctx.value) }
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
            const page = Atom.Registry.make()
            return { page, fresh }
          })),
        When('an initial value is set for it inside a batch')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.batch(s.ctx.page, () => {
              Atom.Registry.setInitialValue(s.ctx.page, s.ctx.fresh, 5)
            })
            return { read: Atom.Registry.get(s.ctx.page, s.ctx.fresh) }
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
            const page = Atom.Registry.make()
            return { page, source, derived }
          })),
        When('an initial value is set on the derived value')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.setInitialValue(s.ctx.page, s.ctx.derived, 7)
            return {
              derived: Atom.Registry.get(s.ctx.page, s.ctx.derived),
              source: Atom.Registry.get(s.ctx.page, s.ctx.source),
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
            const direct = Atom.make(2).pipe(Atom.serializable({ key: 'direct-key', schema: Schema.Finite }))
            const page = Atom.Registry.make()
            return { page, direct }
          })),
        When('a stored value arrives for it')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.get(s.ctx.page, s.ctx.direct)
            Atom.Registry.setSerializable(s.ctx.page, 'direct-key', 9)
            return { read: Atom.Registry.get(s.ctx.page, s.ctx.direct) }
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
              Atom.serializable({ key: 'derived-key', schema: Schema.Finite }),
            )
            const page = Atom.Registry.make()
            return { page, source, derived }
          })),
        When('a stored value arrives before the derived value is ever read')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.setSerializable(s.ctx.page, 'derived-key', 7)
            return {
              derived: Atom.Registry.get(s.ctx.page, s.ctx.derived),
              source: Atom.Registry.get(s.ctx.page, s.ctx.source),
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
            const direct = Atom.make(2).pipe(Atom.serializable({ key: 'unread-key', schema: Schema.Finite }))
            const page = Atom.Registry.make()
            return { page, direct }
          })),
        When('a stored value arrives and the value is then refreshed')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.subscribe(s.ctx.page, s.ctx.direct, () => {})
            Atom.Registry.setSerializable(s.ctx.page, 'unread-key', 9)
            const stored = Atom.Registry.get(s.ctx.page, s.ctx.direct)
            Atom.Registry.refresh(s.ctx.page, s.ctx.direct)
            const rebuilt = Atom.Registry.get(s.ctx.page, s.ctx.direct)
            return { stored, rebuilt }
          })),
        Then('the stored value was applied to the never-read value and then rebuilt from its definition')((s) => {
          expect(s.result.stored).toBe(9)
          expect(s.result.rebuilt).toBe(2)
        }),
      ),
    )
    scenario(
      'A registry provided for the shared name serves values and honors preloaded options',
      Gherkin.Do.pipe(
        Given('two values')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(1)
            const other = Atom.make(2)
            return { value, other }
          })),
        When('one registry is provided under the shared name, another with a preloaded value')(
          'reads',
          (s) =>
            Effect.gen(function*() {
              const defaultRead = yield* Effect.provide(Atom.Registry.layer(Atom.Registry.Current))(
                Effect.gen(function*() {
                  const registry = yield* Atom.Registry.Current
                  return Atom.Registry.get(registry, s.ctx.value)
                }),
              )
              const preloadedRead = yield* Effect.provide(
                Atom.Registry.layer(Atom.Registry.Current, { initialValues: [[s.ctx.other, 9]] }),
              )(
                Effect.gen(function*() {
                  const registry = yield* Atom.Registry.Current
                  return Atom.Registry.get(registry, s.ctx.other)
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
            const page = Atom.Registry.make()
            const value = Atom.make(1)
            Atom.Registry.get(page, value)
            return { page }
          })),
        When('the registry is disposed and a new value is read through it')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.dispose(s.ctx.page)
            const remaining = Atom.Registry.getNodes(s.ctx.page).size
            let message: string | undefined
            try {
              Atom.Registry.get(s.ctx.page, Atom.make(2))
            } catch (error) {
              if (error instanceof Error) {
                message = error.message
              }
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
            const page = Atom.Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
            return { page, source, derived }
          })),
        When('both fall idle and the shared cleanup timer runs')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.get(s.ctx.page, s.ctx.derived)
            const maybeNode = Atom.Registry.getNodes(s.ctx.page).get(s.ctx.derived)
            if (maybeNode === undefined) {
              throw new Error('expected a node after reading the value')
            }
            const node = maybeNode
            const before = node.currentState()
            vi.advanceTimersByTime(100)
            const keys = HashSet.fromIterable(Atom.Registry.getNodes(s.ctx.page).keys())
            const after = node.currentState()
            vi.useRealTimers()
            return {
              before,
              after,
              hasDerived: HashSet.has(keys, s.ctx.derived),
              hasSource: HashSet.has(keys, s.ctx.source),
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
            const page = Atom.Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
            return { page, source, derived }
          })),
        When('both fall idle while the source is still listened to, and the cleanup timer runs')(
          'result',
          (s) =>
            Effect.sync(() => {
              Atom.Registry.get(s.ctx.page, s.ctx.derived)
              Atom.Registry.subscribe(s.ctx.page, s.ctx.source, () => {})
              vi.advanceTimersByTime(100)
              const keys = HashSet.fromIterable(Atom.Registry.getNodes(s.ctx.page).keys())
              vi.useRealTimers()
              return {
                hasDerived: HashSet.has(keys, s.ctx.derived),
                hasSource: HashSet.has(keys, s.ctx.source),
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
            const page = Atom.Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
            return { page, source, derived }
          })),
        When('both fall idle and the cleanup timers run past both windows')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.get(s.ctx.page, s.ctx.derived)
            vi.advanceTimersByTime(15)
            const afterFirstWindow = HashSet.fromIterable(Atom.Registry.getNodes(s.ctx.page).keys())
            vi.advanceTimersByTime(100)
            const afterSecondWindow = HashSet.fromIterable(Atom.Registry.getNodes(s.ctx.page).keys())
            vi.useRealTimers()
            return {
              hasDerivedAfterFirst: HashSet.has(afterFirstWindow, s.ctx.derived),
              hasDerivedAfterSecond: HashSet.has(afterSecondWindow, s.ctx.derived),
              hasSourceAfterFirst: HashSet.has(afterFirstWindow, s.ctx.source),
              hasSourceAfterSecond: HashSet.has(afterSecondWindow, s.ctx.source),
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
            const page = Atom.Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
            return { page, first, second }
          })),
        When('both fall idle and are read again before their window')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.get(s.ctx.page, s.ctx.first)
            Atom.Registry.get(s.ctx.page, s.ctx.second)
            vi.advanceTimersByTime(1)
            Atom.Registry.get(s.ctx.page, s.ctx.first)
            Atom.Registry.get(s.ctx.page, s.ctx.second)
            vi.advanceTimersByTime(100)
            const keys = HashSet.fromIterable(Atom.Registry.getNodes(s.ctx.page).keys())
            vi.useRealTimers()
            return { hasFirst: HashSet.has(keys, s.ctx.first), hasSecond: HashSet.has(keys, s.ctx.second) }
          })),
        Then('both are swept only after being left alone again')((s) => {
          expect(s.result.hasFirst).toBe(false)
          expect(s.result.hasSecond).toBe(false)
        }),
      ),
    )
    scenario(
      'A listener builds the value it watches, and leaving removes it',
      Gherkin.Do.pipe(
        Given('a value in a plain registry')('ctx', () =>
          Effect.sync(() => {
            const value = Atom.make(1)
            const page = Atom.Registry.make()
            return { page, value }
          })),
        When('a listener attaches without reading, then releases')('result', (s) =>
          Effect.gen(function*() {
            const cancel = Atom.Registry.subscribe(s.ctx.page, s.ctx.value, () => {})
            const maybeNode = Atom.Registry.getNodes(s.ctx.page).get(s.ctx.value)
            if (maybeNode === undefined) {
              throw new Error('expected a node after the listener attached')
            }
            const before = maybeNode.currentState()
            cancel()
            yield* Effect.yieldNow
            const keys = HashSet.fromIterable(Atom.Registry.getNodes(s.ctx.page).keys())
            return { before, hasValue: HashSet.has(keys, s.ctx.value) }
          })),
        Then('the listener built the value, and it was removed once the listener left')((s) => {
          expect(s.result.before).toBe('valid')
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
            const page = Atom.Registry.make()
            return { page, source, root, activeChild }
          })),
        When('the lazy value is refreshed while its child is active')('result', (s) =>
          Effect.sync(() => {
            Atom.Registry.get(s.ctx.page, s.ctx.root)
            Atom.Registry.get(s.ctx.page, s.ctx.activeChild)
            const maybeNode = Atom.Registry.getNodes(s.ctx.page).get(s.ctx.root)
            if (maybeNode === undefined) {
              throw new Error('expected a node after reading the value')
            }
            const node = maybeNode
            Atom.Registry.refresh(s.ctx.page, s.ctx.root)
            return { state: node.currentState(), value: Atom.Registry.get(s.ctx.page, s.ctx.root) }
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
            const page = Atom.Registry.make()
            return { page, source, root, left, right, leftChild, rightChild }
          })),
        When('the root is refreshed while nothing listens, then a new value starts reading it')(
          'result',
          (s) =>
            Effect.sync(() => {
              Atom.Registry.get(s.ctx.page, s.ctx.root)
              Atom.Registry.get(s.ctx.page, s.ctx.left)
              Atom.Registry.get(s.ctx.page, s.ctx.right)
              Atom.Registry.get(s.ctx.page, s.ctx.leftChild)
              Atom.Registry.get(s.ctx.page, s.ctx.rightChild)
              const maybeNode = Atom.Registry.getNodes(s.ctx.page).get(s.ctx.root)
              if (maybeNode === undefined) {
                throw new Error('expected a node after reading the value')
              }
              const node = maybeNode
              Atom.Registry.refresh(s.ctx.page, s.ctx.root)
              const afterRefresh = node.currentState()
              const newcomer = Atom.readable((get) => get(s.ctx.root))
              Atom.Registry.get(s.ctx.page, newcomer)
              return {
                afterRefresh,
                finalState: node.currentState(),
                value: Atom.Registry.get(s.ctx.page, s.ctx.root),
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
              const switching = Atom.readable((get) => {
                if (useFirst) {
                  return get(first)
                }
                return get(second)
              })
              const page = Atom.Registry.make()
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
            Atom.Registry.subscribe(s.ctx.page, s.ctx.first, () => {})
            Atom.Registry.get(s.ctx.page, s.ctx.switching)
            s.ctx.flip()
            Atom.Registry.refresh(s.ctx.page, s.ctx.switching)
            const value = Atom.Registry.get(s.ctx.page, s.ctx.switching)
            const keys = HashSet.fromIterable(Atom.Registry.getNodes(s.ctx.page).keys())
            return {
              value,
              hasFirst: HashSet.has(keys, s.ctx.first),
              hasSecond: HashSet.has(keys, s.ctx.second),
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
            const registry = Atom.Registry.make()
            const source = Atom.make(1)
            const plain = Atom.make(3)
            const plainWritable = Atom.make(0)
            const resultWritable = Atom.make<Atom.AsyncResult.Result<number, never>>(Atom.AsyncResult.initial(false))
            const settled = Atom.make<Atom.AsyncResult.Result<number, never>>(Atom.AsyncResult.success(5))
            const loading = Atom.make<Atom.AsyncResult.Result<number, never>>(Atom.AsyncResult.initial(true))
            const initialResult = Atom.make<Atom.AsyncResult.Result<number, never>>(Atom.AsyncResult.initial(false))
            const waiting = Atom.make<Atom.AsyncResult.Result<number, never>>(
              Atom.AsyncResult.successWith(1, { waiting: true }),
            )
            const failed = Atom.make<Atom.AsyncResult.Result<number, string>>(
              Atom.AsyncResult.failure<number, string>(Cause.fail('boom')),
            )
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
              Effect.runFork(get.setResult(resultWritable, Atom.AsyncResult.success(4)))
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
                const _effect = get.setResult(resultWritable, Atom.AsyncResult.success(4))
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
            return { registry, value, loading, waiting, noOption, fibers }
          })),
        When('the value is built, its pending results settle, and the value is then invalidated')(
          'result',
          (s) =>
            Effect.gen(function*() {
              Atom.Registry.get(s.ctx.registry, s.ctx.value)
              yield* Effect.yieldNow
              Atom.Registry.set(s.ctx.registry, s.ctx.loading, Atom.AsyncResult.initial(false))
              Atom.Registry.set(s.ctx.registry, s.ctx.loading, Atom.AsyncResult.success(7))
              Atom.Registry.set(s.ctx.registry, s.ctx.waiting, Atom.AsyncResult.successWith(2, { waiting: true }))
              Atom.Registry.set(s.ctx.registry, s.ctx.waiting, Atom.AsyncResult.success(3))
              Atom.Registry.set(s.ctx.registry, s.ctx.noOption, Option.some(5))
              const [settledFiber, loadingFiber, optionFiber, waitingFiber, noneFiber] = s.ctx.fibers
              if (
                settledFiber === undefined || loadingFiber === undefined || optionFiber === undefined ||
                waitingFiber === undefined || noneFiber === undefined
              ) {
                throw new Error('expected five in-flight fibers')
              }
              const settledValue = yield* Fiber.join(settledFiber)
              const resumedValue = yield* Fiber.join(loadingFiber)
              const optionValue = yield* Fiber.join(optionFiber)
              const throughWaiting = yield* Fiber.join(waitingFiber)
              const throughNone = yield* Fiber.join(noneFiber)
              Atom.Registry.refresh(s.ctx.registry, s.ctx.value)
              const maybeNode = Atom.Registry.getNodes(s.ctx.registry).get(s.ctx.value)
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
    scenario(
      'Two pages that keep their own time let an idle value expire on their own schedules',
      Gherkin.Do.pipe(
        Given('two pages that each keep their own time, both holding the same idle value')(
          'ctx',
          () =>
            Effect.sync(() => {
              const value = Atom.make(1)
              const early = manualClock()
              const late = manualClock()
              const first = Atom.Registry.make({ defaultIdleTTL: 100, timeoutResolution: 10, ...early })
              const second = Atom.Registry.make({ defaultIdleTTL: 100, timeoutResolution: 10, ...late })
              Atom.Registry.get(first, value)
              Atom.Registry.get(second, value)
              return { value, early, late, first, second }
            }),
        ),
        When("only the first page's time passes the cleanup window")('held', (s) =>
          Effect.sync(() => {
            s.ctx.early.advance(200)
            s.ctx.late.advance(50)
            return {
              first: Atom.Registry.getNodes(s.ctx.first).has(s.ctx.value),
              second: Atom.Registry.getNodes(s.ctx.second).has(s.ctx.value),
            }
          })),
        Then('the first page has let the value go while the second still holds it')((s) => {
          expect(s.held.first).toBe(false)
          expect(s.held.second).toBe(true)
        }),
      ),
    )
  })

Feature('Keeping computed values current while unused values are forgotten')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A group of changes that ends where it started tells no listener anything',
      Gherkin.Do.pipe(
        Given('a listener watching a counter and a doubled counter')('ctx', () =>
          Effect.sync(() => {
            const counter = Atom.make(0)
            const doubled = Atom.make((get) => get(counter) * 2)
            const page = Atom.Registry.make()
            const heard: Array<string> = []
            Atom.Registry.subscribe(page, counter, (value) => heard.push(`counter ${value}`))
            Atom.Registry.subscribe(page, doubled, (value) => heard.push(`doubled ${value}`))
            return { page, counter, heard }
          })),
        When('one group moves the counter to 5 and back to 0, and a second group moves it to 3')(
          'heard',
          (s) =>
            Effect.sync(() => {
              Atom.Registry.batch(s.ctx.page, () => {
                Atom.Registry.set(s.ctx.page, s.ctx.counter, 5)
                Atom.Registry.set(s.ctx.page, s.ctx.counter, 0)
              })
              Atom.Registry.batch(s.ctx.page, () => {
                Atom.Registry.set(s.ctx.page, s.ctx.counter, 1)
                Atom.Registry.set(s.ctx.page, s.ctx.counter, 3)
              })
              return s.ctx.heard
            }),
        ),
        Then('the listeners hear only the second group, once each')((s) => {
          expect(s.heard).toEqual(['counter 3', 'doubled 6'])
        }),
      ),
    )
    scenario(
      'Listening from inside a group of changes hears only what changes after it started listening',
      Gherkin.Do.pipe(
        Given('a doubled counter nobody has read yet')('ctx', () =>
          Effect.sync(() => {
            const counter = Atom.make(0)
            const doubled = Atom.make((get) => get(counter) * 2)
            return { page: Atom.Registry.make(), counter, doubled }
          })),
        When('one group starts a listener and an immediate listener, and a second group moves the counter to 1')(
          'heard',
          (s) =>
            Effect.sync(() => {
              const heard: Array<string> = []
              Atom.Registry.batch(s.ctx.page, () => {
                Atom.Registry.subscribe(s.ctx.page, s.ctx.doubled, (value) => heard.push(`listener ${value}`))
                Atom.Registry.subscribe(s.ctx.page, s.ctx.doubled, (value) => heard.push(`immediate ${value}`), {
                  immediate: true,
                })
              })
              heard.push('group ended')
              Atom.Registry.batch(s.ctx.page, () => Atom.Registry.set(s.ctx.page, s.ctx.counter, 1))
              return heard
            }),
        ),
        Then('the immediate listener hears the start value once, and both hear the change once')((s) => {
          expect(s.heard).toEqual(['immediate 0', 'group ended', 'listener 2', 'immediate 2'])
        }),
      ),
    )
    scenario(
      'A value kept alive holds on to the counter it is computed from',
      Gherkin.Do.pipe(
        Given('a page that keeps a running total of a counter alive, and has shown it once')(
          'ctx',
          () =>
            Effect.sync(() => {
              vi.useFakeTimers()
              const counter = Atom.make(0)
              const total = Atom.make((get) => get(counter)).pipe(Atom.keepAlive)
              const page = Atom.Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
              Atom.Registry.get(page, total)
              return { page, counter, total }
            }),
        ),
        When('the counter is set to 1 and the page sits idle well past its cleanup time')(
          'result',
          (s) =>
            Effect.sync(() => {
              Atom.Registry.set(s.ctx.page, s.ctx.counter, 1)
              vi.advanceTimersByTime(100)
              const result = {
                counter: Atom.Registry.get(s.ctx.page, s.ctx.counter),
                total: Atom.Registry.get(s.ctx.page, s.ctx.total),
              }
              vi.useRealTimers()
              return result
            }),
        ),
        Then('the counter still reads 1 and the total shows 1')((s) => {
          expect(s.result).toEqual({ counter: 1, total: 1 })
        }),
      ),
    )
    scenario(
      'A value watched again after going stale hears every later change',
      Gherkin.Do.pipe(
        Given('a doubled counter that was watched once and released, and whose counter was then refreshed')(
          'ctx',
          () =>
            Effect.sync(() => {
              const counter = Atom.make(0)
              const doubled = Atom.make((get) => get(counter) * 2)
              const page = Atom.Registry.make()
              Atom.Registry.subscribe(page, doubled, () => {}, { immediate: true })()
              Atom.Registry.refresh(page, counter)
              return { page, counter, doubled }
            }),
        ),
        When('a new listener watches the doubled counter and the counter goes up by one')(
          'result',
          (s) =>
            Effect.sync(() => {
              const heard: Array<number> = []
              Atom.Registry.subscribe(s.ctx.page, s.ctx.doubled, (value) => heard.push(value))
              Atom.Registry.update(s.ctx.page, s.ctx.counter, (n) => n + 1)
              return { heard, doubled: Atom.Registry.get(s.ctx.page, s.ctx.doubled) }
            }),
        ),
        Then('the listener hears 2 and the doubled counter reads 2')((s) => {
          expect(s.result).toEqual({ heard: [2], doubled: 2 })
        }),
      ),
    )
    scenario(
      'Refreshing a value nobody has read computes nothing, alone or among other changes',
      Gherkin.Do.pipe(
        Given('a value that counts how often it is computed and has never been read')('ctx', () =>
          Effect.sync(() => {
            const computed = { times: 0 }
            const counter = Atom.make(0)
            const counted = Atom.make((get) => {
              computed.times++
              return get(counter)
            })
            const page = Atom.Registry.make()
            return { page, counter, counted, computed }
          })),
        When('it is refreshed on its own, and again inside a group of changes to the counter')(
          'times',
          (s) =>
            Effect.sync(() => {
              Atom.Registry.refresh(s.ctx.page, s.ctx.counted)
              Atom.Registry.batch(s.ctx.page, () => {
                Atom.Registry.set(s.ctx.page, s.ctx.counter, 1)
                Atom.Registry.refresh(s.ctx.page, s.ctx.counted)
              })
              return s.ctx.computed.times
            }),
        ),
        Then('it has never been computed')((s) => {
          expect(s.times).toBe(0)
        }),
      ),
    )
    scenario(
      'A counter is forgotten once the value read from it has gone idle',
      Gherkin.Do.pipe(
        Given('a doubled counter that was read once')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            const counter = Atom.make(0)
            const doubled = Atom.make((get) => get(counter) * 2)
            const page = Atom.Registry.make({ defaultIdleTTL: 10, timeoutResolution: 5 })
            Atom.Registry.get(page, doubled)
            return { page, counter }
          })),
        When('the counter is set to 1 and the page sits idle well past its cleanup time')(
          'counter',
          (s) =>
            Effect.sync(() => {
              Atom.Registry.set(s.ctx.page, s.ctx.counter, 1)
              vi.advanceTimersByTime(100)
              const counter = Atom.Registry.get(s.ctx.page, s.ctx.counter)
              vi.useRealTimers()
              return counter
            }),
        ),
        Then('the counter reads its starting 0 again')((s) => {
          expect(s.counter).toBe(0)
        }),
      ),
    )
  })

class FirstRegistry extends Context.Service<FirstRegistry, Atom.Registry.Registry>()(
  '@systemfsoftware/effect-atom/tests/Registry.integration.test/FirstRegistry',
) {}
class SecondRegistry extends Context.Service<SecondRegistry, Atom.Registry.Registry>()(
  '@systemfsoftware/effect-atom/tests/Registry.integration.test/SecondRegistry',
) {}

Feature('Providing registries by name')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'Two registries provided side by side keep their values separate',
      Gherkin.Do.pipe(
        Given('a value that either registry could hold')('ctx', () => Effect.sync(() => ({ value: Atom.make(0) }))),
        When('both registries are provided together, each under its own name, and one records a new value')(
          'seen',
          (s) =>
            Effect.provide(Layer.merge(Atom.Registry.layer(FirstRegistry), Atom.Registry.layer(SecondRegistry)))(
              Effect.gen(function*() {
                const first = yield* FirstRegistry
                const second = yield* SecondRegistry
                Atom.Registry.set(first, s.ctx.value, 11)
                return {
                  sameRegistry: first === second,
                  onFirst: Atom.Registry.get(first, s.ctx.value),
                  onSecond: Atom.Registry.get(second, s.ctx.value),
                }
              }),
            ),
        ),
        Then('the registries are different, and only the first one shows the new value')((s) => {
          expect(s.seen.sameRegistry).toBe(false)
          expect(s.seen.onFirst).toBe(11)
          expect(s.seen.onSecond).toBe(0)
        }),
      ),
    )
    scenario(
      'A registry whose providing scope closes refuses further reads',
      Gherkin.Do.pipe(
        Given('a registry living for a bounded scope, already holding a value')('ctx', () =>
          Effect.gen(function*() {
            const scope = yield* Scope.make()
            const context = yield* Layer.buildWithScope(Atom.Registry.layer(Atom.Registry.Current), scope)
            const registry = Context.get(context, Atom.Registry.Current)
            const value = Atom.make(5)
            Atom.Registry.get(registry, value)
            return { registry, scope, value }
          })),
        When('the scope closes and the value is read again')('afterwards', (s) =>
          Effect.andThen(
            Scope.close(s.ctx.scope, Exit.void),
            Effect.sync(() => {
              let message: string | undefined
              try {
                Atom.Registry.get(s.ctx.registry, s.ctx.value)
              } catch (error) {
                if (error instanceof Error) {
                  message = error.message
                }
              }
              return { message }
            }),
          )),
        Then('the read failed, and the failure said the registry is gone')((s) => {
          expect(s.afterwards.message).toContain('disposed')
        }),
      ),
    )
    scenarioOutline(
      'Asking a registry for <question> gives the same answer however it is asked',
      [
        {
          question: 'the value it holds',
          expected: 5,
          direct: (registry: Atom.Registry.Registry, value: Atom.Writable<number, number>) =>
            Atom.Registry.get(registry, value),
          curried: (registry: Atom.Registry.Registry, value: Atom.Writable<number, number>) =>
            registry.pipe(Atom.Registry.get(value)),
        },
        {
          question: 'a replacement for the value it holds',
          expected: 8,
          direct: (registry: Atom.Registry.Registry, value: Atom.Writable<number, number>) => {
            Atom.Registry.set(registry, value, 8)
            return Atom.Registry.get(registry, value)
          },
          curried: (registry: Atom.Registry.Registry, value: Atom.Writable<number, number>) => {
            registry.pipe(Atom.Registry.set(value, 8))
            return Atom.Registry.get(registry, value)
          },
        },
        {
          question: 'an adjustment to the value it holds',
          expected: 7,
          direct: (registry: Atom.Registry.Registry, value: Atom.Writable<number, number>) => {
            Atom.Registry.update(registry, value, (n) => n + 2)
            return Atom.Registry.get(registry, value)
          },
          curried: (registry: Atom.Registry.Registry, value: Atom.Writable<number, number>) => {
            registry.pipe(Atom.Registry.update(value, (n) => n + 2))
            return Atom.Registry.get(registry, value)
          },
        },
        {
          question: 'a swap that hands back the old value',
          expected: 5,
          direct: (registry: Atom.Registry.Registry, value: Atom.Writable<number, number>) =>
            Atom.Registry.modify(registry, value, (n) => [n, 9]),
          curried: (registry: Atom.Registry.Registry, value: Atom.Writable<number, number>) =>
            registry.pipe(Atom.Registry.modify(value, (n) => [n, 9])),
        },
        {
          question: 'a seed placed before the value is read',
          expected: 3,
          direct: (registry: Atom.Registry.Registry, value: Atom.Writable<number, number>) => {
            Atom.Registry.setInitialValue(registry, value, 3)
            return Atom.Registry.get(registry, value)
          },
          curried: (registry: Atom.Registry.Registry, value: Atom.Writable<number, number>) => {
            registry.pipe(Atom.Registry.setInitialValue(value, 3))
            return Atom.Registry.get(registry, value)
          },
        },
        {
          question: 'a change while it listens',
          expected: 6,
          direct: (registry: Atom.Registry.Registry, value: Atom.Writable<number, number>) => {
            const heard: number[] = []
            const stop = Atom.Registry.subscribe(registry, value, (n) => heard.push(n))
            Atom.Registry.set(registry, value, 6)
            stop()
            return heard[0]
          },
          curried: (registry: Atom.Registry.Registry, value: Atom.Writable<number, number>) => {
            const heard: number[] = []
            const stop = registry.pipe(Atom.Registry.subscribe(value, (n) => heard.push(n)))
            Atom.Registry.set(registry, value, 6)
            stop()
            return heard[0]
          },
        },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('two pages, each holding a value of five')('ctx', () =>
            Effect.sync(() => ({
              first: { registry: Atom.Registry.make(), value: Atom.make(5) },
              second: { registry: Atom.Registry.make(), value: Atom.make(5) },
            }))),
          When('the question is asked directly of the first page, and through the pipe of the second')(
            'answers',
            (s) =>
              Effect.sync(() => ({
                direct: row.direct(s.ctx.first.registry, s.ctx.first.value),
                curried: row.curried(s.ctx.second.registry, s.ctx.second.value),
              })),
          ),
          Then('both answers match, and they are the expected one')((s) => {
            expect(s.answers.direct).toBe(row.expected)
            expect(s.answers.curried).toBe(row.expected)
          }),
        ),
    )
  })

class VisitLog extends Context.Service<VisitLog, { readonly visits: Array<string> }>()(
  '@systemfsoftware/effect-atom/tests/Registry.integration.test/VisitLog',
) {}

Feature('Keeping private notes per page')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Each page keeps its own notes, and a closed page starts over',
      Gherkin.Do.pipe(
        Given('two open pages')(
          'ctx',
          () => Effect.sync(() => ({ first: Atom.Registry.make(), second: Atom.Registry.make() })),
        ),
        When('the first page notes a visit, then is closed and asked for its notes again')(
          'notes',
          (s) =>
            Effect.sync(() => {
              Atom.Registry.storage(s.ctx.first, VisitLog, () => ({ visits: [] })).visits.push('home')
              const firstBeforeClose = Atom.Registry.storage(s.ctx.first, VisitLog, () => ({ visits: [] })).visits
              const second = Atom.Registry.storage(s.ctx.second, VisitLog, () => ({ visits: [] })).visits
              Atom.Registry.dispose(s.ctx.first)
              const firstAfterClose = s.ctx.first.pipe(Atom.Registry.storage(VisitLog, () => ({ visits: [] }))).visits
              return { firstBeforeClose: [...firstBeforeClose], second, firstAfterClose }
            }),
        ),
        Then('the first page remembered its visit, the second saw none, and the closed page forgot it')((s) => {
          expect(s.notes.firstBeforeClose).toEqual(['home'])
          expect(s.notes.second).toEqual([])
          expect(s.notes.firstAfterClose).toEqual([])
        }),
      ),
    )
  })

function manualClock() {
  const state: {
    time: number
    tasks: ReadonlyArray<() => void>
    timers: ReadonlyArray<{ readonly due: number; readonly run: () => void }>
  } = { time: 0, tasks: [], timers: [] }
  const scheduleTask = (task: () => void): () => void => {
    state.tasks = [...state.tasks, task]
    return () => {
      state.tasks = state.tasks.filter((pending) => pending !== task)
    }
  }
  const runTasks = (): void => {
    const pending = state.tasks
    state.tasks = []
    pending.forEach((task) => task())
  }
  const now = (): number => state.time
  const scheduleTimer = (run: () => void, delayMillis: number): () => void => {
    const timer = { due: state.time + delayMillis, run }
    state.timers = [...state.timers, timer]
    return () => {
      state.timers = state.timers.filter((pending) => pending !== timer)
    }
  }
  const advance = (millis: number): void => {
    runTasks()
    state.time += millis
    const due = state.timers.filter((timer) => timer.due <= state.time)
    state.timers = state.timers.filter((timer) => timer.due > state.time)
    due.forEach((timer) => timer.run())
    runTasks()
  }
  return { now, scheduleTask, scheduleTimer, advance }
}
