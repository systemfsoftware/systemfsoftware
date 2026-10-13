import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { vi } from '@systemfsoftware/vitest'
import { render, renderHook, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { createElement, Suspense } from 'react'
import { findWidgetShowing } from './__fixtures__/find-widget.js'
import {
  pressButton,
  withRegistry,
  withRegistryProvider,
  withStrictRegistryProvider,
} from './__fixtures__/registry-wrapper.js'
import { renderCleanupLayer } from './__fixtures__/render-cleanup.js'

const Feature = makeFeature({ it })

Feature('Reading and changing shared values from on-screen widgets')
  .live('renders real components in Chromium and advances the browser timer queue')
  .withLayer(Layer.empty)
  .withScenarioLayer(renderCleanupLayer)
  .body(({ scenario }) => {
    scenario(
      'A writer who saves through the confirming setter knows when the save has finished',
      Gherkin.Do.pipe(
        Given('a form whose save button waits for the save to finish')('ctx', () =>
          Effect.sync(() => {
            const draft = Atom.fn((n: number) => Effect.succeed(n))
            const { result } = renderHook(() => AtomReact.useAtomSetResult(draft), {
              wrapper: withRegistry(Atom.Registry.make()),
            })
            return { save: () => result.current }
          })),
        When('the writer saves a new draft')('saved', (s) =>
          Effect.gen(function*() {
            const confirmed = yield* s.ctx.save()(42)
            return confirmed
          })),
        Then('the save is confirmed with the stored draft')((s, expect) => expect(s.saved).toBe(42)),
      ),
    )

    scenario(
      'A page that starts with seeded values shows them right away',
      Gherkin.Do.pipe(
        Given('a page whose starting values are seeded before it renders')('ctx', () =>
          Effect.sync(() => {
            const startingBalance = Atom.make(0)
            function Page() {
              AtomReact.useAtomInitialValues([[startingBalance, 7]])
              const balance = AtomReact.useAtomValue(startingBalance)
              return createElement('div', { 'data-testid': 'balance' }, balance)
            }
            render(
              createElement(
                AtomReact.RegistryContext.Provider,
                { value: Atom.Registry.make() },
                createElement(Page),
              ),
            )
            return {}
          })),
        When('the page is shown')('shown', () => Effect.succeed(true)),
        Then('the seeded value is already on screen')((_s, expect) =>
          Effect.promise(() => screen.findByTestId('balance')).pipe(
            Effect.map((balance) => expect(balance).toHaveTextContent('7')),
          )
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
            function Widget() {
              const refresh = AtomReact.useAtomRefresh(reading)
              const value = AtomReact.useAtomValue(reading, Atom.AsyncResult.getOrThrow)
              return createElement(
                'div',
                null,
                createElement('div', { 'data-testid': 'reading' }, value),
                createElement('button', { type: 'button', onClick: refresh }, 'refresh'),
              )
            }
            render(
              createElement(
                AtomReact.RegistryContext.Provider,
                { value: Atom.Registry.make() },
                createElement(Widget),
              ),
            )
            return {}
          })),
        When('the reader asks for fresh data twice')('done', () =>
          Effect.sync(() => {
            pressButton('refresh')
            pressButton('refresh')
          })),
        Then('the widget shows the recomputed reading')((_s, expect) =>
          Effect.promise(() => findWidgetShowing({ testId: 'reading', text: '3' })).pipe(
            Effect.map((reading) => expect(reading).toHaveTextContent('3')),
          )
        ),
      ),
    )

    scenario(
      'A view of one field of a shared record stays in sync with that field',
      Gherkin.Do.pipe(
        Given('a shared record with a view onto one of its fields')('ctx', () =>
          Effect.sync(() => {
            const record = Atom.Ref.make({ name: 'ada', age: 36 })
            function View() {
              const nameRef = AtomReact.useAtomRefProp(record, 'name')
              const name = AtomReact.useAtomRef(nameRef)
              return createElement(
                'div',
                null,
                createElement('div', { 'data-testid': 'name' }, name),
                createElement(
                  'button',
                  { type: 'button', onClick: () => nameRef.pipe(Atom.Ref.set('grace')) },
                  'rename',
                ),
              )
            }
            render(
              createElement(
                AtomReact.RegistryContext.Provider,
                { value: Atom.Registry.make() },
                createElement(View),
              ),
            )
            return { record }
          })),
        When('the field is edited through the view')('done', () =>
          Effect.sync(() => {
            pressButton('rename')
          })),
        Then('the view shows the new value and the rest of the record is untouched')((s, expect) =>
          Effect.promise(() => findWidgetShowing({ testId: 'name', text: 'grace' })).pipe(
            Effect.map((name) =>
              expect({ name: name.textContent, record: Atom.Ref.get(s.ctx.record) })
                .toEqual({ name: 'grace', record: { name: 'grace', age: 36 } })
            ),
          )
        ),
      ),
    )

    scenario(
      'A summary derived from a shared record shows on screen and follows edits to the record',
      Gherkin.Do.pipe(
        Given('a shared record and a view of a summary computed from it')('ctx', () =>
          Effect.sync(() => {
            const record = Atom.Ref.make({ name: 'ada', age: 36 })
            const summary = Atom.Ref.map(record, ({ name, age }) => ({ line: `${name}, ${age}` }))
            function View() {
              const { line } = AtomReact.useAtomRef(summary)
              return createElement(
                'div',
                null,
                createElement('div', { 'data-testid': 'summary' }, line),
                createElement(
                  'button',
                  { type: 'button', onClick: () => record.pipe(Atom.Ref.set({ name: 'grace', age: 85 })) },
                  'replace',
                ),
              )
            }
            render(
              createElement(
                AtomReact.RegistryContext.Provider,
                { value: Atom.Registry.make() },
                createElement(View),
              ),
            )
            return { record }
          })),
        When('the record is replaced')('done', () =>
          Effect.sync(() => {
            pressButton('replace')
          })),
        Then('the summary shows the new record')((_s, expect) =>
          Effect.promise(() => findWidgetShowing({ testId: 'summary', text: 'grace, 85' })).pipe(
            Effect.map((summary) => expect(summary.textContent).toBe('grace, 85')),
          )
        ),
      ),
    )

    scenario(
      'A writer who saves through the exit-reporting setter learns whether the save worked or failed',
      Gherkin.Do.pipe(
        Given('a form whose save button reports success or failure')('ctx', () =>
          Effect.sync(() => {
            const saveDraft = (n: number): Effect.Effect<number, 'rejected'> => {
              if (n > 0) {
                return Effect.succeed(n)
              }
              return Effect.fail('rejected')
            }
            const draft = Atom.fn(saveDraft)
            const { result } = renderHook(() => AtomReact.useAtomSetResult(draft), {
              wrapper: withRegistry(Atom.Registry.make()),
            })
            return { save: () => result.current }
          })),
        When('the writer saves one acceptable draft and one unacceptable draft')(
          'outcomes',
          (s) =>
            Effect.gen(function*() {
              const accepted = yield* s.ctx.save()(5)
              const rejected = yield* Effect.flip(s.ctx.save()(-1))
              return { accepted, rejected }
            }),
        ),
        Then('the first save is reported as accepted and the second as rejected')((s, expect) =>
          expect(s.outcomes).toEqual({ accepted: 5, rejected: 'rejected' })
        ),
      ),
    )

    scenario(
      'A reader who transforms what they read sees the transformed value',
      Gherkin.Do.pipe(
        Given('a widget showing a transformed reading')('ctx', () =>
          Effect.sync(() => {
            const base = Atom.make(7)
            function Widget() {
              const tripled = AtomReact.useAtomValue(base, (n) => n * 3)
              return createElement('div', { 'data-testid': 'tripled' }, tripled)
            }
            render(
              createElement(
                AtomReact.RegistryContext.Provider,
                { value: Atom.Registry.make() },
                createElement(Widget),
              ),
            )
            return {}
          })),
        When('the widget is shown')('shown', () => Effect.succeed(true)),
        Then('the transformed value is on screen')((_s, expect) =>
          Effect.promise(() => screen.findByTestId('tripled')).pipe(
            Effect.map((tripled) => expect(tripled).toHaveTextContent('21')),
          )
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
              const result = AtomReact.useAtomSuspense(failing, { includeFailure: true })
              return createElement('div', { 'data-testid': 'outcome' }, result._tag)
            }
            render(
              createElement(
                AtomReact.RegistryContext.Provider,
                { value: Atom.Registry.make() },
                createElement(
                  Suspense,
                  { fallback: createElement('div', { 'data-testid': 'pending' }, 'loading') },
                  createElement(Widget),
                ),
              ),
            )
            return {}
          })),
        When('the widget is shown')('shown', () => Effect.succeed(true)),
        Then('the failure is on screen')((_s, expect) =>
          Effect.promise(() => screen.findByTestId('outcome')).pipe(
            Effect.map((outcome) => expect(outcome).toHaveTextContent('Failure')),
          )
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
                Atom.serializable({ key: 'temperature', schema: Schema.Finite }),
              )
              const registry = Atom.Registry.make()
              Atom.Registry.set(registry, temperature, 18)
              const savedPage = Atom.Registry.make()
              Atom.Registry.set(savedPage, temperature, 23)
              const saved = Atom.Hydration.dehydrate(savedPage)
              function Page() {
                const value = AtomReact.useAtomValue(temperature)
                return createElement('div', { 'data-testid': 'temperature' }, value)
              }
              render(
                createElement(
                  AtomReact.RegistryContext.Provider,
                  { value: registry },
                  createElement(
                    AtomReact.HydrationBoundary,
                    { state: saved },
                    createElement(Page),
                  ),
                ),
              )
              return {}
            }),
        ),
        When('the page settles after the saved data is committed')(
          'settled',
          () => Effect.promise(() => findWidgetShowing({ testId: 'temperature', text: '23' })),
        ),
        Then('the newer saved value is what ends up on screen')((s, expect) =>
          expect(s.settled).toHaveTextContent('23')
        ),
      ),
    )

    scenario(
      'A data source nobody is using anymore is put away',
      Gherkin.Do.pipe(
        Given('a page whose data source is shared only while shown')('ctx', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            const { result, unmount } = renderHook(() => AtomReact.useRegistry(), { wrapper: withRegistryProvider })
            return { unmount, registry: () => result.current }
          })),
        When('the page disappears and enough time passes')('done', (s) =>
          Effect.sync(() => {
            s.ctx.unmount()
            vi.advanceTimersByTime(1000)
            vi.useRealTimers()
          })),
        Then('the data source no longer answers')((s, expect) =>
          expect(() => Atom.Registry.get(s.ctx.registry(), Atom.make(1))).toThrow('registry is disposed')
        ),
      ),
    )

    scenario(
      'A screen put right back after a blink keeps the value it showed',
      Gherkin.Do.pipe(
        Given('a page showing a value was taken down and put right back inside the blink of an eye')(
          'ctx',
          () =>
            Effect.sync(() => {
              vi.useFakeTimers()
              const savedValue = Atom.make(41)
              const { result } = renderHook(() => AtomReact.useRegistry(), { wrapper: withStrictRegistryProvider })
              Atom.Registry.set(result.current, savedValue, 41)
              return { readSavedValue: () => Atom.Registry.get(result.current, savedValue) }
            }),
        ),
        When('plenty of time passes with the page still up')('done', () =>
          Effect.sync(() => {
            vi.advanceTimersByTime(1000)
            vi.useRealTimers()
          })),
        Then('the page still shows the same value, from a data source that never went away')((s, expect) =>
          expect(s.ctx.readSavedValue()).toBe(41)
        ),
      ),
    )
  })
