import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import * as React from 'react'
import { expect } from 'vitest'

const Feature = makeFeature({ it })

Feature('Restoring saved page state')
  .live('renders real components in Chromium and waits on browser timers')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A page that receives a saved value for a fresh atom shows it immediately',
      Gherkin.Do.pipe(
        Given('a page that will receive saved state for an atom it has not loaded yet')('ctx', () =>
          Effect.sync(() => {
            const temperature = Atom.make(18).pipe(
              Atom.serializable({ key: 'fresh-temperature', schema: Schema.Finite }),
            )
            const savedPage = Atom.Registry.make()
            Atom.Registry.set(savedPage, temperature, 23)
            const saved = Atom.Hydration.dehydrate(savedPage)
            function Page() {
              const value = AtomReact.useAtomValue(temperature)
              return React.createElement('div', { 'data-testid': 'fresh-temperature' }, value)
            }
            render(
              React.createElement(
                AtomReact.RegistryContext.Provider,
                { value: Atom.Registry.make() },
                React.createElement(AtomReact.HydrationBoundary, { state: saved }, React.createElement(Page)),
              ),
            )
            return {}
          })),
        When('the page is shown')('shown', () => Effect.succeed(true)),
        Then('the saved value is already on screen')(() =>
          Effect.promise(function() {
            return expect.element(screen.getByTestId('fresh-temperature')).toHaveTextContent('23')
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
              const registry = Atom.Registry.make()
              Atom.Registry.set(registry, room, 4)
              function Page() {
                const value = AtomReact.useAtomValue(room)
                return React.createElement('div', { 'data-testid': 'plain-room' }, value)
              }
              render(
                React.createElement(
                  AtomReact.RegistryContext.Provider,
                  { value: registry },
                  React.createElement(AtomReact.HydrationBoundary, null, React.createElement(Page)),
                ),
              )
              return {}
            }),
        ),
        When('the page is shown')('shown', () => Effect.succeed(true)),
        Then('the value that was set is still on screen')(() =>
          Effect.promise(function() {
            return expect.element(screen.getByTestId('plain-room')).toHaveTextContent('4')
          })
        ),
      ),
    )
  })
