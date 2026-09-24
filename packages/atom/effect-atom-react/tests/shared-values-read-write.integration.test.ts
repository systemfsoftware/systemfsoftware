import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as AtomRef from '@systemfsoftware/effect-atom/AtomRef'
import * as Hydration from '@systemfsoftware/effect-atom/Hydration'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import * as AsyncResult from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { act, render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import {
  HydrationBoundary,
  RegistryContext,
  RegistryProvider,
  useAtomInitialValues,
  useAtomRef,
  useAtomRefProp,
  useAtomRefresh,
  useAtomSetResult,
  useAtomSubscribe,
  useAtomSuspense,
  useAtomValue,
} from '@systemfsoftware/effect-atom-react'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'
import * as React from 'react'
import { Suspense } from 'react'
import { expect, vi } from 'vitest'

const Feature = makeFeature({ it })

Feature('Reading and changing shared values from on-screen widgets')
  .live('renders real components in Chromium and advances the browser timer queue')
  .body(({ scenario }) => {
    scenario(
      'A writer who saves a new draft learns what was stored',
      Gherkin.Do.pipe(
        Given('Ada opens a form whose save button waits for the save to finish')('ctx', () =>
          Effect.sync(() => {
            const draft = Atom.fn((n: number) => Effect.succeed(n))
            let save: (n: number) => Effect.Effect<number, never> = () =>
              Effect.die(new Error('save called before the form rendered'))
            function Form() {
              save = useAtomSetResult(draft)
              return null
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make() },
                React.createElement(Form),
              ),
            )
            return { save: () => save }
          })),
        When('Ada saves a new draft of 42')('saved', (s) =>
          Effect.gen(function*() {
            const confirmed = yield* s.ctx.save()(42)
            return confirmed
          })),
        Then('Ada learns the stored draft is 42')((s) => {
          expect(s.saved).toBe(42)
        }),
      ),
    )

    scenario(
      'A page that starts with a seeded balance shows it right away',
      Gherkin.Do.pipe(
        Given('Ada opens a page whose starting balance is seeded before it renders')('ctx', () =>
          Effect.sync(() => {
            const startingBalance = Atom.make(0)
            function Page() {
              useAtomInitialValues([[startingBalance, 7]])
              const balance = useAtomValue(startingBalance)
              return React.createElement('div', { 'data-testid': 'balance' }, balance)
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make() },
                React.createElement(Page),
              ),
            )
            return {}
          })),
        When('Ada looks at her starting balance')('shown', () =>
          Effect.as(
            Effect.promise(function() {
              return expect.element(screen.getByTestId('balance')).toHaveTextContent('7')
            }),
            true,
          )),
        Then('Ada sees her seeded balance on screen')((s) => {
          expect(s.shown).toBe(true)
        }),
      ),
    )

    scenario(
      'A reader who asks for fresh data sees the value recomputed',
      Gherkin.Do.pipe(
        Given('Ada opens a widget showing a reading she can refresh on demand')('ctx', () =>
          Effect.sync(() => {
            let readings = 0
            const reading = Atom.make(Effect.sync(() => {
              readings = readings + 1
              return readings
            }))
            let refresh: () => void = () => {
              throw new Error('refresh called before the widget rendered')
            }
            function Widget() {
              refresh = useAtomRefresh(reading)
              const value = useAtomValue(reading, AsyncResult.getOrThrow)
              return React.createElement('div', { 'data-testid': 'reading' }, value)
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make() },
                React.createElement(Widget),
              ),
            )
            return { refresh: () => refresh }
          })),
        When('Ada asks for fresh data twice and looks at the reading')('shown', (s) =>
          Effect.as(
            Effect.promise(() => {
              act(() => {
                s.ctx.refresh()()
              })
              act(() => {
                s.ctx.refresh()()
              })
              return expect.element(screen.getByTestId('reading')).toHaveTextContent('3')
            }),
            true,
          )),
        Then('Ada sees the twice-recomputed reading on screen')((s) => {
          expect(s.shown).toBe(true)
        }),
      ),
    )

    scenario(
      'A listener who wants the starting value hears it and every change',
      Gherkin.Do.pipe(
        Given('Bo listens to a shared volume and asks for its starting value')('ctx', () =>
          Effect.sync(() => {
            const volume = Atom.make(3)
            const heard: number[] = []
            const page = AtomRegistry.make()
            function Listener() {
              useAtomSubscribe(volume, (v) => heard.push(v), { immediate: true })
              return null
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: page },
                React.createElement(Listener),
              ),
            )
            return { volume, heard, page }
          })),
        When('Ada turns the volume to 5 and then to 8')('heard', (s) =>
          Effect.sync(() => {
            act(() => {
              s.ctx.page.set(s.ctx.volume, 5)
            })
            act(() => {
              s.ctx.page.set(s.ctx.volume, 8)
            })
            return s.ctx.heard
          })),
        Then('Bo heard the starting volume and both changes')((s) => {
          expect(s.heard).toEqual([3, 5, 8])
        }),
      ),
    )

    scenario(
      'A view of one field of a shared record stays in sync with that field',
      Gherkin.Do.pipe(
        Given('Ada opens a view onto the name field of a shared record')('ctx', () =>
          Effect.sync(() => {
            const record = AtomRef.make({ name: 'ada', age: 36 })
            let nameRef: AtomRef.AtomRef<string> = AtomRef.make('')
            function View() {
              nameRef = useAtomRefProp(record, 'name')
              const name = useAtomRef(nameRef)
              return React.createElement('div', { 'data-testid': 'name' }, name)
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make() },
                React.createElement(View),
              ),
            )
            return { record, nameRef: () => nameRef }
          })),
        When('Ada edits the name through the view to grace and reads the record')(
          'state',
          (s) =>
            Effect.gen(function*() {
              yield* Effect.sync(() => {
                act(() => {
                  s.ctx.nameRef().set('grace')
                })
              })
              yield* Effect.promise(function() {
                return expect.element(screen.getByTestId('name')).toHaveTextContent('grace')
              })
              return s.ctx.record.value
            }),
        ),
        Then('Ada sees the new name on screen and the rest of the record is untouched')((s) => {
          expect(s.state).toEqual({ name: 'grace', age: 36 })
        }),
      ),
    )

    scenario(
      'A writer who saves an acceptable draft and an unacceptable draft learns which worked',
      Gherkin.Do.pipe(
        Given('Ada opens a form whose save button reports success or failure')('ctx', () =>
          Effect.sync(() => {
            const saveDraft = (n: number): Effect.Effect<number, 'rejected'> => {
              if (n > 0) {
                return Effect.succeed(n)
              }
              return Effect.fail('rejected')
            }
            const draft = Atom.fn(saveDraft)
            let save: (n: number) => Effect.Effect<number, 'rejected'> = () =>
              Effect.die(new Error('save called before the form rendered'))
            function Form() {
              save = useAtomSetResult(draft)
              return null
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make() },
                React.createElement(Form),
              ),
            )
            return { save: () => save }
          })),
        When('Ada saves 5 and then saves -1')(
          'outcomes',
          (s) =>
            Effect.gen(function*() {
              const accepted = yield* Effect.exit(s.ctx.save()(5))
              const rejected = yield* Effect.exit(s.ctx.save()(-1))
              return { accepted, rejected }
            }),
        ),
        Then('Ada learns the first save was accepted with 5 and the second was rejected')((s) => {
          let acceptedValue: number | null = null
          if (Exit.isSuccess(s.outcomes.accepted)) {
            acceptedValue = s.outcomes.accepted.value
          }
          expect(acceptedValue).toBe(5)
          expect(Exit.isFailure(s.outcomes.rejected)).toBe(true)
        }),
      ),
    )

    scenario(
      'A reader who triples what they read sees the tripled value',
      Gherkin.Do.pipe(
        Given('Ada opens a widget showing triple her base number')('ctx', () =>
          Effect.sync(() => {
            const base = Atom.make(7)
            function Widget() {
              const tripled = useAtomValue(base, (n) => n * 3)
              return React.createElement('div', { 'data-testid': 'tripled' }, tripled)
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make() },
                React.createElement(Widget),
              ),
            )
            return {}
          })),
        When('Ada looks at her tripled number')('shown', () =>
          Effect.as(
            Effect.promise(function() {
              return expect.element(screen.getByTestId('tripled')).toHaveTextContent('21')
            }),
            true,
          )),
        Then('Ada sees 21 on screen')((s) => {
          expect(s.shown).toBe(true)
        }),
      ),
    )

    scenario(
      'A reader whose data source fails sees the failure instead of a crash',
      Gherkin.Do.pipe(
        Given('Ada opens a widget whose data source is unavailable')('ctx', () =>
          Effect.sync(() => {
            const failing = Atom.make(Effect.fail<'unavailable'>('unavailable'))
            function Widget() {
              const result = useAtomSuspense(failing, { includeFailure: true })
              return React.createElement('div', { 'data-testid': 'outcome' }, result._tag)
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make() },
                React.createElement(
                  Suspense,
                  { fallback: React.createElement('div', { 'data-testid': 'pending' }, 'loading') },
                  React.createElement(Widget),
                ),
              ),
            )
            return {}
          })),
        When('Ada looks at the page where her data should be')('shown', () =>
          Effect.as(
            Effect.promise(function() {
              return expect.element(screen.getByTestId('outcome')).toHaveTextContent('Failure')
            }),
            true,
          )),
        Then('Ada sees the failure on screen')((s) => {
          expect(s.shown).toBe(true)
        }),
      ),
    )

    scenario(
      'A reloaded page commits the saved value once it is safe',
      Gherkin.Do.pipe(
        Given('Ada reopens a page showing 18 with a saved page holding 23 for the same value')(
          'ctx',
          () =>
            Effect.sync(() => {
              const temperature = Atom.make(18).pipe(
                Atom.serializable({ key: 'temperature', schema: Schema.Finite }),
              )
              const page = AtomRegistry.make()
              page.set(temperature, 18)
              const savedPage = AtomRegistry.make()
              savedPage.set(temperature, 23)
              const saved = Hydration.dehydrate(savedPage)
              function Page() {
                const value = useAtomValue(temperature)
                return React.createElement('div', { 'data-testid': 'temperature' }, value)
              }
              render(
                React.createElement(
                  RegistryContext.Provider,
                  { value: page },
                  React.createElement(
                    HydrationBoundary,
                    { state: saved },
                    React.createElement(Page),
                  ),
                ),
              )
              return {}
            }),
        ),
        When('Ada looks at the reloaded temperature')('shown', () =>
          Effect.as(
            Effect.promise(function() {
              return expect.element(screen.getByTestId('temperature')).toHaveTextContent('23')
            }),
            true,
          )),
        Then('Ada sees the saved 23 on screen')((s) => {
          expect(s.shown).toBe(true)
        }),
      ),
    )

    scenario(
      'A page data source nobody is using anymore is put away',
      Gherkin.Do.pipe(
        Given('Ada opens a page whose data source is shared only while she watches')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            let page: AtomRegistry.Registry = AtomRegistry.make()
            function Probe() {
              page = React.useContext(RegistryContext)
              return null
            }
            const { unmount } = render(
              React.createElement(
                RegistryProvider,
                null,
                React.createElement(Probe),
              ),
            )
            return { unmount, page: () => page }
          })),
        When('Ada leaves the page and enough time passes')('left', (s) =>
          Effect.sync(() => {
            s.ctx.unmount()
            vi.advanceTimersByTime(1000)
            vi.useRealTimers()
          })),
        Then('the data source no longer answers')((s) => {
          expect(() => s.ctx.page().get(Atom.make(1))).toThrow('registry is disposed')
        }),
      ),
    )

    scenario(
      'A page whose data source never went away keeps showing its value',
      Gherkin.Do.pipe(
        Given('Ada opens a page showing her saved number')(
          'ctx',
          () =>
            Effect.sync(() => {
              vi.useFakeTimers()
              const savedNumber = Atom.make(41)
              let page: AtomRegistry.Registry = AtomRegistry.make()
              function Probe() {
                page = React.useContext(RegistryContext)
                return null
              }
              render(
                React.createElement(
                  React.StrictMode,
                  null,
                  React.createElement(
                    RegistryProvider,
                    null,
                    React.createElement(Probe),
                  ),
                ),
              )
              page.set(savedNumber, 41)
              return { readSavedNumber: () => page.get(savedNumber) }
            }),
        ),
        When('Ada keeps the page up while plenty of time passes')('kept', () =>
          Effect.sync(() => {
            vi.advanceTimersByTime(1000)
            vi.useRealTimers()
          })),
        Then('Ada still reads her saved 41 from a data source that never went away')((s) => {
          expect(s.ctx.readSavedNumber()).toBe(41)
        }),
      ),
    )
  })
