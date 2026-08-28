import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { act, render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import { make, RegistryContext, useAtomSet, useAtomUpdate, useAtomValue } from '@systemfsoftware/effect-atom-react'
import * as Effect from 'effect/Effect'
import * as React from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Scoped atoms that belong to one part of the page')
  .body(({ scenario }) => {
    scenario(
      'A scoped counter is created for its subtree and updates through its setter',
      Gherkin.Do.pipe(
        Given('a scoped counter atom with a widget that can read and update it')('ctx', () =>
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
        When('the counter is set to a new value and then increased from the current value')(
          'done',
          (s) =>
            Effect.sync(() => {
              act(() => {
                s.ctx.set()(5)
              })
              act(() => {
                s.ctx.increment()((previous) => previous + 1)
              })
            }),
        ),
        Then('the widget shows the updated counter')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('scoped-counter')).toHaveTextContent('6')
          })
        ),
      ),
    )

    scenario(
      'A scoped atom created with an input starts with that input',
      Gherkin.Do.pipe(
        Given('a scoped atom that takes a name as its input')('ctx', () =>
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
        When('the greeting is shown')('shown', () => Effect.sync(() => true)),
        Then('the input name is on screen')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('greeting')).toHaveTextContent('Ada')
          })
        ),
      ),
    )

    scenario(
      'A scoped atom provider that renders again keeps its original atom',
      Gherkin.Do.pipe(
        Given('a page that can rename the input of a scoped atom provider')('ctx', () =>
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
        When('the page asks for a new name for the provider')('done', (s) =>
          Effect.sync(() => {
            act(() => {
              s.ctx.rename()()
            })
          })),
        Then('the original atom is still on screen')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('kept-name')).toHaveTextContent('Ada')
          })
        ),
      ),
    )

    scenario(
      'A scoped atom read outside its provider reports that the provider is missing',
      Gherkin.Do.pipe(
        Given('a widget that reads a scoped atom without its provider, inside an error boundary')(
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
        When('the widget is shown')('shown', () => Effect.sync(() => true)),
        Then('the error boundary reports the missing provider')(() =>
          Effect.promise(async () => {
            await expect.element(screen.getByTestId('missing-provider')).toHaveTextContent('provider missing')
          })
        ),
      ),
    )
  })
