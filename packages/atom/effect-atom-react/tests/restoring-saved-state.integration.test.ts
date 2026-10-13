import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { createElement } from 'react'
import { ownRegistry, renderCleanupLayer } from './__fixtures__/render-cleanup.js'

const Feature = makeFeature({ it })

Feature('Restoring saved page state')
  .live('renders real components in Chromium and waits on browser timers')
  .withLayer(Layer.empty)
  .withScenarioLayer(renderCleanupLayer)
  .body(({ scenario }) => {
    scenario(
      'A page whose owner restores a saved value before rendering shows it in its first commit',
      Gherkin.Do.pipe(
        Given('saved state for an atom the page has not loaded yet, restored by the owner before the page renders')(
          'ctx',
          () =>
            Effect.sync(() => {
              const temperature = Atom.make(18).pipe(
                Atom.serializable({ key: 'owned-temperature', schema: Schema.Finite }),
              )
              const savedPage = Atom.Registry.make()
              Atom.Registry.set(savedPage, temperature, 23)
              const registry = ownRegistry()
              Atom.Hydration.hydrate(registry, Atom.Hydration.dehydrate(savedPage))
              function Page() {
                const value = AtomReact.useAtomValue(temperature)
                return createElement('div', { 'data-testid': 'owned-temperature' }, value)
              }
              render(createElement(AtomReact.RegistryProvider, { registry }, createElement(Page)))
              return {}
            }),
        ),
        When('the first commit is read')(
          'firstCommit',
          () => Effect.sync(() => screen.getByTestId('owned-temperature').textContent),
        ),
        Then('the saved value is what the page first showed')((s, expect) => expect(s.firstCommit).toBe('23')),
      ),
    )

    scenario(
      'A page whose owner restores no saved state shows the values the owner set',
      Gherkin.Do.pipe(
        Given('a value the owner sets before rendering, with nothing saved to restore')('ctx', () =>
          Effect.sync(() => {
            const room = Atom.make(4)
            const registry = ownRegistry()
            Atom.Registry.set(registry, room, 4)
            Atom.Hydration.hydrate(registry, [])
            function Page() {
              const value = AtomReact.useAtomValue(room)
              return createElement('div', { 'data-testid': 'owned-room' }, value)
            }
            render(createElement(AtomReact.RegistryProvider, { registry }, createElement(Page)))
            return {}
          })),
        When('the first commit is read')(
          'firstCommit',
          () => Effect.sync(() => screen.getByTestId('owned-room').textContent),
        ),
        Then('the value the owner set is what the page first showed')((s, expect) => expect(s.firstCommit).toBe('4')),
      ),
    )
  })
