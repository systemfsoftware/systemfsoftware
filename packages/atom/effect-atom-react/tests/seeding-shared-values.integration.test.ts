import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { createElement } from 'react'
import { renderCleanupLayer } from './__fixtures__/render-cleanup.js'

const Feature = makeFeature({ it })

Feature('Seeding shared values')
  .live('renders real components in Chromium and waits on browser timers')
  .withLayer(Layer.empty)
  .withScenarioLayer(renderCleanupLayer)
  .body(({ scenario }) => {
    scenario(
      'A page that seeds the same value twice keeps only the first seed',
      Gherkin.Do.pipe(
        Given('a page that seeds a value twice before reading it')('ctx', () =>
          Effect.sync(() => {
            const balance = Atom.make(0)
            function Page() {
              AtomReact.useAtomInitialValues([[balance, 7]])
              AtomReact.useAtomInitialValues([[balance, 9]])
              const value = AtomReact.useAtomValue(balance)
              return createElement('div', { 'data-testid': 'seeded-balance' }, value)
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
        Then('only the first seed is on screen')((_s, expect) =>
          Effect.promise(() => screen.findByTestId('seeded-balance')).pipe(
            Effect.map((seededBalance) => expect(seededBalance).toHaveTextContent('7')),
          )
        ),
      ),
    )

    scenario(
      'Two pages backed by different data sources each see their own starting value',
      Gherkin.Do.pipe(
        Given('two pages under separate data sources, each seeded with its own starting value')(
          'ctx',
          () =>
            Effect.sync(() => {
              const balance = Atom.make(0)
              function Page({ id, seed }: { readonly id: string; readonly seed: number }) {
                AtomReact.useAtomInitialValues([[balance, seed]])
                const value = AtomReact.useAtomValue(balance)
                return createElement('div', { 'data-testid': id }, value)
              }
              render(
                createElement(
                  AtomReact.RegistryContext.Provider,
                  { value: Atom.Registry.make() },
                  createElement(Page, { id: 'first-balance', seed: 3 }),
                ),
              )
              render(
                createElement(
                  AtomReact.RegistryContext.Provider,
                  { value: Atom.Registry.make() },
                  createElement(Page, { id: 'second-balance', seed: 8 }),
                ),
              )
              return {}
            }),
        ),
        When('both pages are shown')('shown', () => Effect.succeed(true)),
        Then('each page shows its own starting value')((_s, expect) =>
          Effect.promise(() =>
            Promise.all([screen.findByTestId('first-balance'), screen.findByTestId('second-balance')])
          ).pipe(
            Effect.map(([first, second]) =>
              expect({ first: first.textContent, second: second.textContent })
                .toEqual({ first: '3', second: '8' })
            ),
          )
        ),
      ),
    )
  })
