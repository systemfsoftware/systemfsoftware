import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { act, render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import { make, RegistryContext, useAtomSet, useAtomUpdate, useAtomValue } from '@systemfsoftware/effect-atom-react'
import * as Effect from 'effect/Effect'
import * as React from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { expect } from 'vitest'

const Feature = makeFeature({ it })

Feature('Scoped counters that belong to one part of the page')
  .live('renders real components in Chromium and waits on browser timers')
  .body(({ scenario }) => {
    scenario(
      'A scoped counter updates through its own setter for its part of the page',
      Gherkin.Do.pipe(
        Given('Ada opens a widget with its own counter she can read and update')('ctx', () =>
          Effect.sync(() => {
            const Counter = make(() => Atom.make(0))
            let set: (value: number) => void = () => {
              throw new Error('set called before the widget rendered')
            }
            let increment: (f: (previous: number) => number) => void = () => {
              throw new Error('increment called before the widget rendered')
            }
            function Widget() {
              const atom = Counter.use()
              const value = useAtomValue(atom)
              set = useAtomSet(atom)
              increment = useAtomUpdate(atom)
              return React.createElement('div', { 'data-testid': 'scoped-counter' }, value)
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make() },
                React.createElement(Counter.Provider, null, React.createElement(Widget)),
              ),
            )
            return { set: () => set, increment: () => increment }
          })),
        When('Ada sets her counter to 5 and then adds one more')(
          'shown',
          (s) =>
            Effect.as(
              Effect.promise(() => {
                act(() => {
                  s.ctx.set()(5)
                })
                act(() => {
                  s.ctx.increment()((previous) => previous + 1)
                })
                return expect.element(screen.getByTestId('scoped-counter')).toHaveTextContent('6')
              }),
              true,
            ),
        ),
        Then('Ada sees 6 on her counter')((s) => {
          expect(s.shown).toBe(true)
        }),
      ),
    )

    scenario(
      'A scoped greeting starts with the name its part of the page was given',
      Gherkin.Do.pipe(
        Given('Ada opens a greeting made for her by name')('ctx', () =>
          Effect.sync(() => {
            const UserName = make((name: string) => Atom.make(name))
            function Greeting() {
              const atom = UserName.use()
              const value = useAtomValue(atom)
              return React.createElement('div', { 'data-testid': 'greeting' }, value)
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make() },
                React.createElement(UserName.Provider, { value: 'Ada' }, React.createElement(Greeting)),
              ),
            )
            return {}
          })),
        When('Ada looks at her greeting')('shown', () =>
          Effect.as(
            Effect.promise(function() {
              return expect.element(screen.getByTestId('greeting')).toHaveTextContent('Ada')
            }),
            true,
          )),
        Then('Ada sees her own name on screen')((s) => {
          expect(s.shown).toBe(true)
        }),
      ),
    )

    scenario(
      'A scoped greeting keeps its original name when its part of the page is renamed',
      Gherkin.Do.pipe(
        Given('Ada opens a page that can switch the greeting to a new name')('ctx', () =>
          Effect.sync(() => {
            const UserName = make((name: string) => Atom.make(name))
            let rename: () => void = () => {
              throw new Error('rename called before the greeting rendered')
            }
            function Greeting() {
              const atom = UserName.use()
              const value = useAtomValue(atom)
              return React.createElement('div', { 'data-testid': 'kept-name' }, value)
            }
            function Page() {
              const [name, setName] = React.useState('Ada')
              rename = () => setName('Grace')
              return React.createElement(UserName.Provider, { value: name }, React.createElement(Greeting))
            }
            render(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make() },
                React.createElement(Page),
              ),
            )
            return { rename: () => rename }
          })),
        When('Ada asks the page for the new name and looks at her greeting')('shown', (s) =>
          Effect.as(
            Effect.promise(() => {
              act(() => {
                s.ctx.rename()()
              })
              return expect.element(screen.getByTestId('kept-name')).toHaveTextContent('Ada')
            }),
            true,
          )),
        Then('Ada still sees her original name on screen')((s) => {
          expect(s.shown).toBe(true)
        }),
      ),
    )

    scenario(
      'A widget outside its part of the page reports that its data source is missing',
      Gherkin.Do.pipe(
        Given('Ada opens a widget whose counter lives in a part of the page she left')(
          'ctx',
          () =>
            Effect.sync(() => {
              const Counter = make(() => Atom.make(0))
              function Widget() {
                const atom = Counter.use()
                const value = useAtomValue(atom)
                return React.createElement('div', { 'data-testid': 'unscoped-value' }, value)
              }
              render(
                React.createElement(
                  RegistryContext.Provider,
                  { value: AtomRegistry.make() },
                  React.createElement(
                    ErrorBoundary,
                    { fallback: React.createElement('div', { 'data-testid': 'missing-provider' }, 'provider missing') },
                    React.createElement(Widget),
                  ),
                ),
              )
              return {}
            }),
        ),
        When('Ada looks at the page where her counter should be')('shown', () =>
          Effect.as(
            Effect.promise(function() {
              return expect.element(screen.getByTestId('missing-provider')).toHaveTextContent('provider missing')
            }),
            true,
          )),
        Then('Ada sees that her counter is missing its part of the page')((s) => {
          expect(s.shown).toBe(true)
        }),
      ),
    )
  })
