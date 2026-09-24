import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as Hydration from '@systemfsoftware/effect-atom/Hydration'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import { HydrationBoundary, RegistryContext, useAtomValue } from '@systemfsoftware/effect-atom-react'
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
      'A page that receives a saved value for a fresh value shows it immediately',
      Gherkin.Do.pipe(
        Given('Ada reopens a page saved earlier with her preferred temperature')('ctx', () =>
          Effect.sync(() => {
            const temperature = Atom.make(18).pipe(
              Atom.serializable({ key: 'fresh-temperature', schema: Schema.Finite }),
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
        When('Ada looks at the restored temperature')('shown', () =>
          Effect.as(
            Effect.promise(function() {
              return expect.element(screen.getByTestId('fresh-temperature')).toHaveTextContent('23')
            }),
            true,
          )),
        Then('Ada sees her saved temperature on screen')((s) => {
          expect(s.shown).toBe(true)
        }),
      ),
    )

    scenario(
      'A page without saved state keeps showing what it already had',
      Gherkin.Do.pipe(
        Given('Ada adjusts her room temperature before the page renders')(
          'ctx',
          () =>
            Effect.sync(() => {
              const room = Atom.make(4)
              const page = AtomRegistry.make()
              page.set(room, 4)
              function Page() {
                const value = useAtomValue(room)
                return React.createElement('div', { 'data-testid': 'plain-room' }, value)
              }
              render(
                React.createElement(
                  RegistryContext.Provider,
                  { value: page },
                  React.createElement(HydrationBoundary, null, React.createElement(Page)),
                ),
              )
              return {}
            }),
        ),
        When('Ada looks at the room temperature')('shown', () =>
          Effect.as(
            Effect.promise(function() {
              return expect.element(screen.getByTestId('plain-room')).toHaveTextContent('4')
            }),
            true,
          )),
        Then('Ada still sees the temperature she set')((s) => {
          expect(s.shown).toBe(true)
        }),
      ),
    )
  })
