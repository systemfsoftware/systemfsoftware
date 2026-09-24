/**
 * Browser scenarios for the two page-owned event sources on-screen values can
 * follow: whether the page is in view, and what the page's web address says.
 *
 * These run in the browser Vitest project, so the events are real dispatches on
 * the real document and address. Every outcome is read off the widgets on the
 * page; no event source is replaced.
 *
 * @since 4.0.0
 */
import { vi } from '@effect/vitest'
import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { act, render, screen } from '@testing-library/react'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as React from 'react'
import { renderCleanupLayer } from './__fixtures__/render-cleanup.js'

const Feature = makeFeature({ it })

let pageIsInView: DocumentVisibilityState = document.visibilityState

Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => pageIsInView,
})

const showThePage = (): void => {
  pageIsInView = 'visible'
}

const announceThePageCameIntoView = (): void => {
  window.dispatchEvent(new Event('visibilitychange'))
}

const announceTheAddressChanged = (): void => {
  window.dispatchEvent(new Event('popstate'))
}

const visit = (search: string): void => {
  window.history.replaceState({}, '', `${window.location.pathname}${search}`)
}

const readLog = () => {
  let reads = 0
  return {
    record: (): void => {
      reads += 1
    },
    seen: (): number => reads,
    counted: (): number => {
      reads += 1
      return reads
    },
  }
}

const waitUntilRegistryEmpties = (registry: Atom.Registry.Registry): Promise<void> =>
  vi.waitFor(() => {
    const held = Atom.Registry.getNodes(registry).size
    if (held !== 0) {
      throw new Error(`the registry still holds ${held} values`)
    }
  })

function FocusFollowingValue({ atom }: { readonly atom: Atom.Atom<number> }) {
  return React.createElement('span', { 'data-testid': 'focus-following-value' }, AtomReact.useAtomValue(atom))
}

function AddressFollowingValue({ atom }: { readonly atom: Atom.Atom<Option.Option<number>> }) {
  const pageNumber = AtomReact.useAtomValue(atom)
  return React.createElement(
    'span',
    { 'data-testid': 'address-following-value' },
    Option.getOrElse(pageNumber, () => 'no page chosen'),
  )
}

function AddressTracker({ atom }: { readonly atom: Atom.Atom<string> }) {
  return React.createElement('span', { 'data-testid': 'address-value' }, AtomReact.useAtomValue(atom))
}

Feature('Keeping on-screen values in step with the browser page')
  .live('renders real components in Chromium and reacts to page focus and search params')
  .withLayer(Layer.empty)
  .withScenarioLayer(renderCleanupLayer)
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'A value that follows page focus <outcome> when the page turns <toward>',
      [
        { outcome: 'is read again', readAgain: true, state: 'visible', toward: 'into view' },
        { outcome: 'keeps its last value', readAgain: false, state: 'hidden', toward: 'out of view' },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a widget showing a value that follows page focus, after the page has come back into view once')(
            'ctx',
            () =>
              Effect.sync(() => {
                const reads = readLog()
                const followed = Atom.refreshOnWindowFocus(Atom.make(reads.counted))
                const registry = Atom.Registry.make()
                render(
                  React.createElement(
                    AtomReact.RegistryContext.Provider,
                    { value: registry },
                    React.createElement(FocusFollowingValue, { atom: followed }),
                  ),
                )
                showThePage()
                act(() => {
                  announceThePageCameIntoView()
                })
                return { focusedValue: screen.getByTestId('focus-following-value') }
              }),
          ),
          When(`the page turns ${row.toward}`)('seen', (s) =>
            Effect.sync(() => {
              const before = s.ctx.focusedValue.textContent
              pageIsInView = row.state
              act(() => {
                announceThePageCameIntoView()
              })
              return { after: s.ctx.focusedValue.textContent, before }
            })),
          Then(`the widget ${row.outcome}`)((s, expect) =>
            expect(s.seen).toSatisfy(
              (seen) => (seen.after !== seen.before) === row.readAgain,
              row.readAgain
                ? 'the page turned into view, so the widget read its value again'
                : 'the page turned out of view, so the widget kept its last value',
            )
          ),
        ),
    )

    scenarioOutline(
      'A web address naming <named> shows <shown> on the page',
      [
        { named: 'page 42', search: '?page=42', shown: '42' },
        { named: 'a page number that is not a number', search: '?page=not-a-number', shown: 'no page chosen' },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given(`a page whose address names ${row.named}`)('ctx', () =>
            Effect.sync(() => {
              visit(row.search)
              const pageNumber = Atom.searchParam('page', { schema: Schema.FiniteFromString })
              return { pageNumber, registry: Atom.Registry.make() }
            })),
          When('the widget that reads the page number from the address appears')('shown', (s) =>
            Effect.sync(() => {
              render(
                React.createElement(
                  AtomReact.RegistryContext.Provider,
                  { value: s.ctx.registry },
                  React.createElement(AddressFollowingValue, { atom: s.ctx.pageNumber }),
                ),
              )
              return { page: screen.getByTestId('address-following-value').textContent }
            })),
          Then(`the page shows ${row.shown}`)((s, expect) => expect(s.shown.page).toBe(row.shown)),
        ),
    )

    scenario(
      'A widget that leaves the page stops following focus and address changes',
      Gherkin.Do.pipe(
        Given(
          'a page showing a widget that follows page focus and another that follows the page number in the address',
        )(
          'ctx',
          () =>
            Effect.sync(() => {
              const focusReads = readLog()
              const addressReads = readLog()
              const followed = Atom.refreshOnWindowFocus(Atom.make(focusReads.counted))
              const chosenPage = Atom.searchParam('page')
              const trackedPage = Atom.make((get) => {
                addressReads.record()
                return get(chosenPage)
              })
              const registry = Atom.Registry.make()
              visit('?page=7')
              const view = render(
                React.createElement(
                  AtomReact.RegistryContext.Provider,
                  { value: registry },
                  React.createElement(FocusFollowingValue, { atom: followed }),
                  React.createElement(AddressTracker, { atom: trackedPage }),
                ),
              )
              showThePage()
              act(() => {
                announceThePageCameIntoView()
              })
              visit('?page=8')
              act(() => {
                announceTheAddressChanged()
              })
              return { addressReads, focusReads, registry, view }
            }),
        ),
        When('both widgets leave the page, and the page turns into view again and names a different page number')(
          'observed',
          (s) =>
            Effect.gen(function*() {
              const attending = { address: s.ctx.addressReads.seen(), focus: s.ctx.focusReads.seen() }
              act(() => {
                s.ctx.view.unmount()
              })
              yield* Effect.promise(() => waitUntilRegistryEmpties(s.ctx.registry))
              showThePage()
              act(() => {
                announceThePageCameIntoView()
              })
              visit('?page=9')
              act(() => {
                announceTheAddressChanged()
              })
              return {
                afterLeaving: { address: s.ctx.addressReads.seen(), focus: s.ctx.focusReads.seen() },
                attending,
              }
            }),
        ),
        Then('neither widget read its value again')((s, expect) =>
          expect({ afterLeaving: s.observed.afterLeaving, attending: s.observed.attending }).toMatchObject({
            afterLeaving: {
              address: s.observed.attending.address,
              focus: s.observed.attending.focus,
            },
            attending: {
              address: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
              focus: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
            },
          })
        ),
      ),
    )
  })
