import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { act, render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import {
  RegistryContext,
  useAtomInitialValues,
  useAtomSubscribe,
  useAtomValue,
} from '@systemfsoftware/effect-atom-react'
import * as Effect from 'effect/Effect'
import * as React from 'react'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

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
              return React.createElement('div', { 'data-testid': 'seeded-balance' }, value)
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
              React.createElement(RegistryContext.Provider, { value: registry }, React.createElement(Listener)),
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
