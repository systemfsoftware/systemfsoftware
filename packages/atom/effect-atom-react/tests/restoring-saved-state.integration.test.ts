import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as Hydration from '@systemfsoftware/effect-atom/Hydration'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import { HydrationBoundary, RegistryContext, useAtomValue } from '@systemfsoftware/effect-atom-react'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as React from 'react'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

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
              return React.createElement('div', { 'data-testid': 'fresh-temperature' }, value)
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make() },
                React.createElement(HydrationBoundary, { state: saved }, React.createElement(Page)),
              ),
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
                return React.createElement('div', { 'data-testid': 'plain-room' }, value)
              }
              render(
                React.createElement(
                  RegistryContext.Provider,
                  { value: registry },
                  React.createElement(HydrationBoundary, null, React.createElement(Page)),
                ),
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
