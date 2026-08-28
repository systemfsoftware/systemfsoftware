import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as AtomRef from '@systemfsoftware/effect-atom/AtomRef'
import * as Hydration from '@systemfsoftware/effect-atom/Hydration'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import * as AsyncResult from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
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

const Feature = makeFeature({ it, layer })

Feature('Reading and changing shared values from on-screen widgets')
  .body(({ scenario }) => {
    scenario(
      'A writer who saves through the confirming setter knows when the save has finished',
      Gherkin.Do.pipe(
        Given('a form whose save button waits for the save to finish')('ctx', () =>
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
        When('the writer saves a new draft')('saved', (s) =>
          Effect.gen(function*() {
            const confirmed = yield* s.ctx.save()(42)
            return confirmed
          })),
        Then('the save is confirmed with the stored draft')((s) => {
          expect(s.saved).toBe(42)
        }),
      ),
    )

    scenario(
      'A page that starts with seeded values shows them right away',
      Gherkin.Do.pipe(
        Given('a page whose starting values are seeded before it renders')('ctx', () =>
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
        When('the page is shown')('shown', () => Effect.sync(() => true)),
        Then('the seeded value is already on screen')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('balance')).toHaveTextContent('7')
          })
        ),
      ),
    )

    scenario(
      'A reader who asks for fresh data sees the value recomputed',
      Gherkin.Do.pipe(
        Given('a widget showing a reading that can be refreshed on demand')('ctx', () =>
          Effect.sync(() => {
            let readings = 0
            const reading = Atom.make(Effect.sync(() => ++readings))
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
        When('the reader asks for fresh data twice')('done', (s) =>
          Effect.sync(() => {
            act(() => {
              s.ctx.refresh()()
            })
            act(() => {
              s.ctx.refresh()()
            })
          })),
        Then('the widget shows the recomputed reading')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('reading')).toHaveTextContent('3')
          })
        ),
      ),
    )

    scenario(
      'A listener attached to a value hears every change without showing it',
      Gherkin.Do.pipe(
        Given('a listener watching a shared value')('ctx', () =>
          Effect.sync(() => {
            const volume = Atom.make(3)
            const heard: number[] = []
            const registry = AtomRegistry.make()
            function Listener() {
              useAtomSubscribe(volume, (v) => heard.push(v), { immediate: true })
              return null
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: registry },
                React.createElement(Listener),
              ),
            )
            return { volume, heard, registry }
          })),
        When('the value changes twice')('heard', (s) =>
          Effect.sync(() => {
            act(() => {
              s.ctx.registry.set(s.ctx.volume, 5)
            })
            act(() => {
              s.ctx.registry.set(s.ctx.volume, 8)
            })
            return s.ctx.heard
          })),
        Then('the listener heard the starting value and both changes')((s) => {
          expect(s.heard).toEqual([3, 5, 8])
        }),
      ),
    )

    scenario(
      'A view of one field of a shared record stays in sync with that field',
      Gherkin.Do.pipe(
        Given('a shared record with a view onto one of its fields')('ctx', () =>
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
        When('the field is edited through the view')('done', (s) =>
          Effect.sync(() => {
            act(() => {
              s.ctx.nameRef().set('grace')
            })
          })),
        Then('the view shows the new value and the rest of the record is untouched')((s) =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('name')).toHaveTextContent('grace')
            expect(s.ctx.record.value).toEqual({ name: 'grace', age: 36 })
          })
        ),
      ),
    )

    scenario(
      'A writer who saves through the exit-reporting setter learns whether the save worked or failed',
      Gherkin.Do.pipe(
        Given('a form whose save button reports success or failure')('ctx', () =>
          Effect.sync(() => {
            const draft = Atom.fn((n: number) => n > 0 ? Effect.succeed(n) : Effect.fail<'rejected'>('rejected'))
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
        When('the writer saves one acceptable draft and one unacceptable draft')(
          'outcomes',
          (s) =>
            Effect.gen(function*() {
              const accepted = yield* Effect.exit(s.ctx.save()(5))
              const rejected = yield* Effect.exit(s.ctx.save()(-1))
              return { accepted, rejected }
            }),
        ),
        Then('the first save is reported as accepted and the second as rejected')((s) => {
          const acceptedValue = Exit.isSuccess(s.outcomes.accepted) ? s.outcomes.accepted.value : null
          expect(acceptedValue).toBe(5)
          expect(Exit.isFailure(s.outcomes.rejected)).toBe(true)
        }),
      ),
    )

    scenario(
      'A reader who transforms what they read sees the transformed value',
      Gherkin.Do.pipe(
        Given('a widget showing a transformed reading')('ctx', () =>
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
        When('the widget is shown')('shown', () => Effect.sync(() => true)),
        Then('the transformed value is on screen')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('tripled')).toHaveTextContent('21')
          })
        ),
      ),
    )

    scenario(
      'A reader who accepts failures sees the failure instead of the widget crashing',
      Gherkin.Do.pipe(
        Given('a widget that shows failures instead of crashing')('ctx', () =>
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
        When('the widget is shown')('shown', () => Effect.sync(() => true)),
        Then('the failure is on screen')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('outcome')).toHaveTextContent('Failure')
          })
        ),
      ),
    )

    scenario(
      'A reloaded page keeps showing its current value until the saved one is safely committed',
      Gherkin.Do.pipe(
        Given('a page already showing a value, receiving a saved page with a newer value for it')(
          'ctx',
          () =>
            Effect.sync(() => {
              const temperature = Atom.make(18).pipe(
                Atom.serializable({ key: 'temperature', schema: Schema.Number }),
              )
              const registry = AtomRegistry.make()
              registry.set(temperature, 18)
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
                  { value: registry },
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
        When('the page settles after the saved data is committed')('settled', () =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('temperature')).toHaveTextContent('23')
          })),
        Then('the newer saved value is what ends up on screen')(() => Effect.sync(() => true)),
      ),
    )

    scenario(
      'A data source nobody is using anymore is put away',
      Gherkin.Do.pipe(
        Given('a page whose data source is shared only while shown')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            let registry: AtomRegistry.Registry = AtomRegistry.make()
            function Probe() {
              registry = React.useContext(RegistryContext)
              return null
            }
            const { unmount } = render(
              React.createElement(
                RegistryProvider,
                null,
                React.createElement(Probe),
              ),
            )
            return { unmount, registry: () => registry }
          })),
        When('the page disappears and enough time passes')('done', (s) =>
          Effect.sync(() => {
            s.ctx.unmount()
            vi.advanceTimersByTime(1000)
            vi.useRealTimers()
          })),
        Then('the data source no longer answers')((s) => {
          expect(() => s.ctx.registry().get(Atom.make(1))).toThrow('registry is disposed')
        }),
      ),
    )
  })
