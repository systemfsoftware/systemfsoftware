import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as AtomRef from '@systemfsoftware/effect-atom/AtomRef'
import * as Hydration from '@systemfsoftware/effect-atom/Hydration'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import * as AsyncResult from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec-v4'
import { act, render, screen } from '@testing-library/react'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'
import * as React from 'react'
import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { expect, vi } from 'vitest'
import {
  HydrationBoundary,
  make,
  RegistryContext,
  RegistryProvider,
  useAtomInitialValues,
  useAtomRef,
  useAtomRefProp,
  useAtomRefresh,
  useAtomSet,
  useAtomSubscribe,
  useAtomSuspense,
  useAtomValue,
} from '../src/index.js'

const Feature = makeFeature({ it, layer })

Feature('Keeping two on-screen widgets showing values from separate data sources independent of each other')
  .body(({ scenario }) => {
    scenario(
      "A widget still loading is not affected when a different widget's cleanup timer runs",
      Gherkin.Do.pipe(
        Given(
          'two independent widgets, each backed by a value that never finishes loading, with a short cleanup timer',
        )(
          'ctx',
          () =>
            Effect.sync(() => {
              vi.useFakeTimers()
              const atom = Atom.make(Effect.never as Effect.Effect<number>)
              const first = AtomRegistry.make({ defaultIdleTTL: 5 })
              const second = AtomRegistry.make({ defaultIdleTTL: 5 })
              return { atom, first, second }
            }),
        ),
        When('both widgets are shown, and time passes long enough for cleanup to run')(
          'state',
          (s) =>
            Effect.sync(() => {
              function Comp({ id }: { readonly id: string }) {
                const value = useAtomSuspense(s.ctx.atom).value
                return <div data-testid={`${id}-value`}>{value as any}</div>
              }

              render(
                <RegistryContext.Provider value={s.ctx.first}>
                  <Suspense fallback={<div data-testid='first-loading'>L1</div>}>
                    <Comp id='first' />
                  </Suspense>
                </RegistryContext.Provider>,
              )
              render(
                <RegistryContext.Provider value={s.ctx.second}>
                  <Suspense fallback={<div data-testid='second-loading'>L2</div>}>
                    <Comp id='second' />
                  </Suspense>
                </RegistryContext.Provider>,
              )

              vi.advanceTimersByTime(100)

              const firstLoading = !!screen.queryByTestId('first-loading')
              const secondLoading = !!screen.queryByTestId('second-loading')

              vi.useRealTimers()
              return { firstLoading, secondLoading }
            }),
        ),
        Then('the widgets do not both flip to the same state together')((s) => {
          expect(s.state.firstLoading || s.state.secondLoading).toBe(true)
        }),
      ),
    )
  })

Feature('Reading and changing shared values from on-screen widgets')
  .body(({ scenario }) => {
    scenario(
      'A writer who saves through the confirming setter knows when the save has finished',
      Gherkin.Do.pipe(
        Given('a form whose save button waits for the save to finish')('ctx', () =>
          Effect.sync(() => {
            const draft = Atom.fn((n: number) => Effect.succeed(n))
            let save!: (n: number) => Effect.Effect<number, never>
            function Form() {
              save = useAtomSet(draft, { mode: 'effect' })
              return null
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <Form />
              </RegistryContext.Provider>,
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
              return <div data-testid='balance'>{balance}</div>
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <Page />
              </RegistryContext.Provider>,
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
            let refresh!: () => void
            function Widget() {
              refresh = useAtomRefresh(reading)
              const value = useAtomValue(reading, AsyncResult.getOrThrow)
              return <div data-testid='reading'>{value}</div>
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <Widget />
              </RegistryContext.Provider>,
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
              <RegistryContext.Provider value={registry}>
                <Listener />
              </RegistryContext.Provider>,
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
            let nameRef!: AtomRef.AtomRef<string>
            function View() {
              nameRef = useAtomRefProp(record, 'name')
              const name = useAtomRef(nameRef)
              return <div data-testid='name'>{name}</div>
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <View />
              </RegistryContext.Provider>,
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
            const draft = Atom.fn((n: number) => n > 0 ? Effect.succeed(n) : Effect.fail('rejected' as const))
            let save!: (n: number) => Effect.Effect<number, 'rejected'>
            function Form() {
              save = useAtomSet(draft, { mode: 'effect' })
              return null
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <Form />
              </RegistryContext.Provider>,
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
          expect(Exit.isSuccess(s.outcomes.accepted) && s.outcomes.accepted.value === 5).toBe(true)
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
              return <div data-testid='tripled'>{tripled}</div>
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <Widget />
              </RegistryContext.Provider>,
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
            const failing = Atom.make(Effect.fail('unavailable' as const))
            function Widget() {
              const result = useAtomSuspense(failing, { includeFailure: true })
              return <div data-testid='outcome'>{result._tag}</div>
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <Suspense fallback={<div data-testid='pending'>loading</div>}>
                  <Widget />
                </Suspense>
              </RegistryContext.Provider>,
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
                return <div data-testid='temperature'>{value}</div>
              }
              render(
                <RegistryContext.Provider value={registry}>
                  <HydrationBoundary state={saved}>
                    <Page />
                  </HydrationBoundary>
                </RegistryContext.Provider>,
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
            let registry!: AtomRegistry.Registry
            function Probe() {
              registry = React.useContext(RegistryContext)
              return null
            }
            const { unmount } = render(
              <RegistryProvider>
                <Probe />
              </RegistryProvider>,
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
          expect(() => s.ctx.registry().get(Atom.make(1))).toThrow()
        }),
      ),
    )
  })

Feature('Scoped atoms that belong to one part of the page')
  .body(({ scenario }) => {
    scenario(
      'A scoped counter is created for its subtree and updates through its setter',
      Gherkin.Do.pipe(
        Given('a scoped counter atom with a widget that can read and update it')('ctx', () =>
          Effect.sync(() => {
            const Counter = make(() => Atom.make(0))
            let set!: (value: number | ((value: number) => number)) => void
            function Widget() {
              const atom = Counter.use()
              const value = useAtomValue(atom)
              set = useAtomSet(atom)
              return <div data-testid='scoped-counter'>{value}</div>
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <Counter.Provider>
                  <Widget />
                </Counter.Provider>
              </RegistryContext.Provider>,
            )
            return { set: () => set }
          })),
        When('the counter is set to a new value and then increased from the current value')(
          'done',
          (s) =>
            Effect.sync(() => {
              act(() => {
                s.ctx.set()(5)
              })
              act(() => {
                s.ctx.set()((previous) => previous + 1)
              })
            }),
        ),
        Then('the widget shows the updated counter')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('scoped-counter')).toHaveTextContent('6')
          })
        ),
      ),
    )

    scenario(
      'A scoped atom created with an input starts with that input',
      Gherkin.Do.pipe(
        Given('a scoped atom that takes a name as its input')('ctx', () =>
          Effect.sync(() => {
            const UserName = make((name: string) => Atom.make(name))
            function Greeting() {
              const atom = UserName.use()
              const value = useAtomValue(atom)
              return <div data-testid='greeting'>{value}</div>
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <UserName.Provider value='Ada'>
                  <Greeting />
                </UserName.Provider>
              </RegistryContext.Provider>,
            )
            return {}
          })),
        When('the greeting is shown')('shown', () => Effect.sync(() => true)),
        Then('the input name is on screen')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('greeting')).toHaveTextContent('Ada')
          })
        ),
      ),
    )

    scenario(
      'A scoped atom provider that renders again keeps its original atom',
      Gherkin.Do.pipe(
        Given('a page that can rename the input of a scoped atom provider')('ctx', () =>
          Effect.sync(() => {
            const UserName = make((name: string) => Atom.make(name))
            let rename!: () => void
            function Greeting() {
              const atom = UserName.use()
              const value = useAtomValue(atom)
              return <div data-testid='kept-name'>{value}</div>
            }
            function Page() {
              const [name, setName] = React.useState('Ada')
              rename = () => setName('Grace')
              return (
                <UserName.Provider value={name}>
                  <Greeting />
                </UserName.Provider>
              )
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <Page />
              </RegistryContext.Provider>,
            )
            return { rename: () => rename }
          })),
        When('the page asks for a new name for the provider')('done', (s) =>
          Effect.sync(() => {
            act(() => {
              s.ctx.rename()()
            })
          })),
        Then('the original atom is still on screen')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('kept-name')).toHaveTextContent('Ada')
          })
        ),
      ),
    )

    scenario(
      'A scoped atom read outside its provider reports that the provider is missing',
      Gherkin.Do.pipe(
        Given('a widget that reads a scoped atom without its provider, inside an error boundary')(
          'ctx',
          () =>
            Effect.sync(() => {
              const Counter = make(() => Atom.make(0))
              function Widget() {
                const atom = Counter.use()
                const value = useAtomValue(atom)
                return <div data-testid='unscoped-value'>{value}</div>
              }
              render(
                <RegistryContext.Provider value={AtomRegistry.make()}>
                  <ErrorBoundary fallback={<div data-testid='missing-provider'>provider missing</div>}>
                    <Widget />
                  </ErrorBoundary>
                </RegistryContext.Provider>,
              )
              return {}
            }),
        ),
        When('the widget is shown')('shown', () => Effect.sync(() => true)),
        Then('the error boundary reports the missing provider')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('missing-provider')).toHaveTextContent('provider missing')
          })
        ),
      ),
    )
  })

Feature('Restoring saved page state')
  .body(({ scenario }) => {
    scenario(
      'A page that receives a saved value for a fresh atom shows it immediately',
      Gherkin.Do.pipe(
        Given('a page that will receive saved state for an atom it has not loaded yet')('ctx', () =>
          Effect.sync(() => {
            const temperature = Atom.make(18).pipe(
              Atom.serializable({ key: 'fresh-temperature', schema: Schema.Number }),
            )
            const savedPage = AtomRegistry.make()
            savedPage.set(temperature, 23)
            const saved = Hydration.dehydrate(savedPage)
            function Page() {
              const value = useAtomValue(temperature)
              return <div data-testid='fresh-temperature'>{value}</div>
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <HydrationBoundary state={saved}>
                  <Page />
                </HydrationBoundary>
              </RegistryContext.Provider>,
            )
            return {}
          })),
        When('the page is shown')('shown', () => Effect.sync(() => true)),
        Then('the saved value is already on screen')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('fresh-temperature')).toHaveTextContent('23')
          })
        ),
      ),
    )

    scenario(
      'A hydration boundary without saved state leaves the page values alone',
      Gherkin.Do.pipe(
        Given('a page whose value is set before it renders, wrapped in a boundary without saved state')(
          'ctx',
          () =>
            Effect.sync(() => {
              const room = Atom.make(4)
              const registry = AtomRegistry.make()
              registry.set(room, 4)
              function Page() {
                const value = useAtomValue(room)
                return <div data-testid='plain-room'>{value}</div>
              }
              render(
                <RegistryContext.Provider value={registry}>
                  <HydrationBoundary>
                    <Page />
                  </HydrationBoundary>
                </RegistryContext.Provider>,
              )
              return {}
            }),
        ),
        When('the page is shown')('shown', () => Effect.sync(() => true)),
        Then('the value that was set is still on screen')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('plain-room')).toHaveTextContent('4')
          })
        ),
      ),
    )
  })

Feature('Seeding and listening to shared values')
  .body(({ scenario }) => {
    scenario(
      'A page that seeds the same value twice keeps only the first seed',
      Gherkin.Do.pipe(
        Given('a page that seeds a value twice before reading it')('ctx', () =>
          Effect.sync(() => {
            const balance = Atom.make(0)
            function Page() {
              useAtomInitialValues([[balance, 7]])
              useAtomInitialValues([[balance, 9]])
              const value = useAtomValue(balance)
              return <div data-testid='seeded-balance'>{value}</div>
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <Page />
              </RegistryContext.Provider>,
            )
            return {}
          })),
        When('the page is shown')('shown', () => Effect.sync(() => true)),
        Then('only the first seed is on screen')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('seeded-balance')).toHaveTextContent('7')
          })
        ),
      ),
    )

    scenario(
      'A listener attached without the immediate flag hears only later changes',
      Gherkin.Do.pipe(
        Given('a listener watching a value without asking for the current value')('ctx', () =>
          Effect.sync(() => {
            const volume = Atom.make(3)
            const heard: number[] = []
            const registry = AtomRegistry.make()
            function Listener() {
              useAtomSubscribe(volume, (v) => heard.push(v))
              return null
            }
            render(
              <RegistryContext.Provider value={registry}>
                <Listener />
              </RegistryContext.Provider>,
            )
            return { volume, heard, registry }
          })),
        When('the value changes once')('heard', (s) =>
          Effect.sync(() => {
            act(() => {
              s.ctx.registry.set(s.ctx.volume, 5)
            })
            return s.ctx.heard
          })),
        Then('the listener heard only the change, not the starting value')((s) => {
          expect(s.heard).toEqual([5])
        }),
      ),
    )
  })

Feature('Waiting for asynchronous values')
  .body(({ scenario }) => {
    scenario(
      'A reader who waits through loading sees the value once it arrives',
      Gherkin.Do.pipe(
        Given('a value that arrives once it is delivered and a widget that waits through loading')(
          'ctx',
          () =>
            Effect.sync(() => {
              const source = Deferred.makeUnsafe<number>()
              const loaded = Atom.make(Deferred.await(source))
              function Widget() {
                const result = useAtomSuspense(loaded, { suspendOnWaiting: true })
                return <div data-testid='loaded-value'>{result.value}</div>
              }
              render(
                <RegistryContext.Provider value={AtomRegistry.make()}>
                  <Suspense fallback={<div data-testid='loading'>loading</div>}>
                    <Widget />
                  </Suspense>
                </RegistryContext.Provider>,
              )
              return { source }
            }),
        ),
        When('the value is delivered to the widget')('settled', (s) =>
          Effect.promise(async () => {
            await act(async () => {
              await Effect.runPromise(Deferred.succeed(s.ctx.source, 5))
            })
          })),
        Then('the loaded value is on screen')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('loaded-value')).toHaveTextContent('5')
          })
        ),
      ),
    )

    scenario(
      'A reader who waits through a refresh sees the refreshed value',
      Gherkin.Do.pipe(
        Given('a value that reloads on demand and a widget that waits through loading')('ctx', () =>
          Effect.sync(() => {
            let release!: Deferred.Deferred<number>
            const loaded = Atom.make(
              Effect.gen(function*() {
                const current = Deferred.makeUnsafe<number>()
                release = current
                return yield* Deferred.await(current)
              }),
            )
            let refresh!: () => void
            function Widget() {
              refresh = useAtomRefresh(loaded)
              const result = useAtomSuspense(loaded, { suspendOnWaiting: true })
              return <div data-testid='refreshed-value'>{result.value}</div>
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <Suspense fallback={<div data-testid='refreshing'>loading</div>}>
                  <Widget />
                </Suspense>
              </RegistryContext.Provider>,
            )
            return { release: () => release, refresh: () => refresh }
          })),
        When('the first value arrives, the reader asks for a refresh, and the newer value arrives')(
          'settled',
          (s) =>
            Effect.promise(async () => {
              await act(async () => {
                await Effect.runPromise(Deferred.succeed(s.ctx.release(), 1))
              })
              await expect.element(screen.getByTestId('refreshed-value')).toHaveTextContent('1')
              await act(async () => {
                s.ctx.refresh()()
              })
              await act(async () => {
                await Effect.runPromise(Deferred.succeed(s.ctx.release(), 2))
              })
            }),
        ),
        Then('the widget shows the refreshed value')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('refreshed-value')).toHaveTextContent('2')
          })
        ),
      ),
    )

    scenario(
      'A reader who does not accept failures sees the error message instead of the widget',
      Gherkin.Do.pipe(
        Given('a widget backed by a value that fails, wrapped in an error boundary')('ctx', () =>
          Effect.sync(() => {
            const failing = Atom.make(Effect.fail(new Error('unavailable')))
            function Widget() {
              useAtomSuspense(failing)
              return <div data-testid='unexpected-widget'>unexpected</div>
            }
            render(
              <RegistryContext.Provider value={AtomRegistry.make()}>
                <ErrorBoundary fallback={<div data-testid='failure-message'>failed to load</div>}>
                  <Suspense fallback={<div data-testid='waiting'>loading</div>}>
                    <Widget />
                  </Suspense>
                </ErrorBoundary>
              </RegistryContext.Provider>,
            )
            return {}
          })),
        When('the widget is shown')('shown', () => Effect.sync(() => true)),
        Then('the error boundary shows the failure message and the widget is not rendered')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('failure-message')).toHaveTextContent('failed to load')
            expect(screen.queryByTestId('unexpected-widget')).toBeNull()
          })
        ),
      ),
    )
  })

Feature('Keeping a shared registry alive')
  .body(({ scenario }) => {
    scenario(
      'A provider that re-renders keeps serving the same registry',
      Gherkin.Do.pipe(
        Given('a page under a strict provider that can be re-rendered')('ctx', () =>
          Effect.sync(() => {
            const count = Atom.make(0)
            const seenRegistries: AtomRegistry.Registry[] = []
            let tick!: () => void
            function Page() {
              seenRegistries.push(React.useContext(RegistryContext))
              const [n, setN] = React.useState(0)
              tick = () => setN((x) => x + 1)
              const value = useAtomValue(count)
              return <div data-testid='stable-count'>{n}:{value}</div>
            }
            render(
              <React.StrictMode>
                <RegistryProvider>
                  <Page />
                </RegistryProvider>
              </React.StrictMode>,
            )
            return { tick: () => tick, seenRegistries }
          })),
        When('the page is re-rendered')('done', (s) =>
          Effect.sync(() => {
            act(() => {
              s.ctx.tick()
            })
          })),
        Then('every render saw the same registry')((s) => {
          expect(new Set(s.ctx.seenRegistries).size).toBe(1)
        }),
      ),
    )
  })
