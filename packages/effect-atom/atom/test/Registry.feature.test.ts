import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec-v4'
import { Effect, Fiber, Latch } from 'effect'
import { expect, vi } from 'vitest'
import * as Atom from '../src/Atom.js'
import * as Registry from '../src/Registry.js'
import * as Result from '../src/Result.js'

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
  })

Feature('Letting go of sources a derived value no longer follows')
  .body(({ scenario }) => {
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
  })

Feature('Waiting for a settled answer instead of a stale one')
  .body(({ scenario }) => {
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
  })

Feature('Hearing the current value right away when listening')
  .body(({ scenario }) => {
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
            const heard: Array<number> = []
            s.ctx.page.subscribe(s.ctx.value, (v) => heard.push(v), { immediate: true })
            return heard
          })),
        Then('the listener heard the current value without waiting for a change')((s) => {
          expect(s.heard).toEqual([5])
        }),
      ),
    )
  })

Feature('Sharing a cleanup schedule between values')
  .body(({ scenario }) => {
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
  })

Feature('Releasing a mounted value when its lifetime ends')
  .body(({ scenario }) => {
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
  })
