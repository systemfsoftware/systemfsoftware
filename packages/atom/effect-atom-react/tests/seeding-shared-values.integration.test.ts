import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { createElement } from 'react'
import { ownRegistry, renderCleanupLayer } from './__fixtures__/render-cleanup.js'

const Feature = makeFeature({ it })

Feature('Seeding shared values')
  .live('renders real components in Chromium and waits on browser timers')
  .withLayer(Layer.empty)
  .withScenarioLayer(renderCleanupLayer)
  .body(({ scenario }) => {
    scenario(
      'Two pages whose owners seed different starting values each show their own in the first commit',
      Gherkin.Do.pipe(
        Given('two pages, each under a registry its owner seeded with its own starting value')(
          'ctx',
          () =>
            Effect.sync(() => {
              const balance = Atom.make(0)
              function Page({ id }: { readonly id: string }) {
                const value = AtomReact.useAtomValue(balance)
                return createElement('div', { 'data-testid': id }, value)
              }
              render(
                createElement(
                  AtomReact.RegistryProvider,
                  { registry: ownRegistry([[balance, 3]]) },
                  createElement(Page, { id: 'first-owned-balance' }),
                ),
              )
              render(
                createElement(
                  AtomReact.RegistryProvider,
                  { registry: ownRegistry([[balance, 8]]) },
                  createElement(Page, { id: 'second-owned-balance' }),
                ),
              )
              return {}
            }),
        ),
        When('the first commits are read')('firstCommits', () =>
          Effect.sync(() => ({
            first: screen.getByTestId('first-owned-balance').textContent,
            second: screen.getByTestId('second-owned-balance').textContent,
          }))),
        Then('each page first showed its own starting value')((s, expect) =>
          expect(s.firstCommits).toEqual({ first: '3', second: '8' })
        ),
      ),
    )
  })
