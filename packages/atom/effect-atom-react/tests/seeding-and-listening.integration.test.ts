import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
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

const Feature = makeFeature({ it })

Feature('Seeding and listening to shared values')
  .live('renders real components in Chromium and waits on browser timers')
  .body(({ scenario }) => {
    scenario(
      'A page that seeds the same value twice keeps only the first seed',
      Gherkin.Do.pipe(
        Given('Mara opens a page that seeds her balance twice before it renders')('ctx', () =>
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
        When('Mara looks at the seeded balance')('shown', () =>
          Effect.as(
            Effect.promise(function() {
              return expect.element(screen.getByTestId('seeded-balance')).toHaveTextContent('7')
            }),
            true,
          )),
        Then('Mara sees the first seed on screen')((s) => {
          expect(s.shown).toBe(true)
        }),
      ),
    )
    scenario(
      'A listener who skips the starting value hears only what changes',
      Gherkin.Do.pipe(
        Given('Bo listens to a shared volume without asking for its starting value')('ctx', () =>
          Effect.sync(() => {
            const volume = Atom.make(3)
            const heard: number[] = []
            const page = AtomRegistry.make()
            function Listener() {
              useAtomSubscribe(volume, (v) => heard.push(v))
              return null
            }
            render(
              React.createElement(RegistryContext.Provider, { value: page }, React.createElement(Listener)),
            )
            return { volume, heard, page }
          })),
        When('Ada turns the volume up to 5')('heard', (s) =>
          Effect.sync(() => {
            act(() => {
              s.ctx.page.set(s.ctx.volume, 5)
            })
            return s.ctx.heard
          })),
        Then('Bo heard only the new volume, not the starting one')((s) => {
          expect(s.heard).toEqual([5])
        }),
      ),
    )
  })
