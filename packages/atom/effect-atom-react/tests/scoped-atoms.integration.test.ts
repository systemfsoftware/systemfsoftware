import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { createElement, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { findWidgetShowing } from './__fixtures__/find-widget.js'
import { pressButton } from './__fixtures__/registry-wrapper.js'
import { renderCleanupLayer } from './__fixtures__/render-cleanup.js'

const Feature = makeFeature({ it })

Feature('Scoped atoms that belong to one part of the page')
  .live('renders real components in Chromium and waits on browser timers')
  .withLayer(Layer.empty)
  .withScenarioLayer(renderCleanupLayer)
  .body(({ scenario }) => {
    scenario(
      'A scoped counter is created for its subtree and updates through its setter',
      Gherkin.Do.pipe(
        Given('a scoped counter atom with a widget that can read and update it')('ctx', () =>
          Effect.sync(() => {
            const Counter = AtomReact.make(() => Atom.make(0))
            function Widget() {
              const atom = Counter.use()
              const value = AtomReact.useAtomValue(atom)
              const set = AtomReact.useAtomSet(atom)
              const increment = AtomReact.useAtomUpdate(atom)
              return createElement(
                'div',
                null,
                createElement('div', { 'data-testid': 'scoped-counter' }, value),
                createElement('button', { type: 'button', onClick: () => set(5) }, 'set to five'),
                createElement('button', {
                  type: 'button',
                  onClick: () => increment((previous) => previous + 1),
                }, 'increase'),
              )
            }
            render(
              createElement(
                AtomReact.RegistryContext.Provider,
                { value: Atom.Registry.make() },
                createElement(Counter.Provider, null, createElement(Widget)),
              ),
            )
            return {}
          })),
        When('the counter is set to a new value and then increased from the current value')(
          'done',
          () =>
            Effect.sync(() => {
              pressButton('set to five')
              pressButton('increase')
            }),
        ),
        Then('the widget shows the updated counter')((_s, expect) =>
          Effect.promise(() => findWidgetShowing({ testId: 'scoped-counter', text: '6' })).pipe(
            Effect.map((counter) => expect(counter).toHaveTextContent('6')),
          )
        ),
      ),
    )

    scenario(
      'A scoped atom created with an input starts with that input',
      Gherkin.Do.pipe(
        Given('a scoped atom that takes a name as its input')('ctx', () =>
          Effect.sync(() => {
            const UserName = AtomReact.make((name: string) => Atom.make(name))
            function Greeting() {
              const atom = UserName.use()
              const value = AtomReact.useAtomValue(atom)
              return createElement('div', { 'data-testid': 'greeting' }, value)
            }
            render(
              createElement(
                AtomReact.RegistryContext.Provider,
                { value: Atom.Registry.make() },
                createElement(UserName.Provider, { value: 'Ada' }, createElement(Greeting)),
              ),
            )
            return {}
          })),
        When('the greeting is shown')('shown', () => Effect.succeed(true)),
        Then('the input name is on screen')((_s, expect) =>
          Effect.promise(() => screen.findByTestId('greeting')).pipe(
            Effect.map((greeting) => expect(greeting).toHaveTextContent('Ada')),
          )
        ),
      ),
    )

    scenario(
      'A scoped atom provider that renders again keeps its original atom',
      Gherkin.Do.pipe(
        Given('a page that can rename the input of a scoped atom provider')('ctx', () =>
          Effect.sync(() => {
            const UserName = AtomReact.make((name: string) => Atom.make(name))
            function Greeting() {
              const atom = UserName.use()
              const value = AtomReact.useAtomValue(atom)
              return createElement('div', { 'data-testid': 'kept-name' }, value)
            }
            function Page() {
              const [name, setName] = useState('Ada')
              return createElement(
                'div',
                null,
                createElement(UserName.Provider, { value: name }, createElement(Greeting)),
                createElement('button', { type: 'button', onClick: () => setName('Grace') }, 'rename'),
              )
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
        When('the page asks for a new name for the provider')('done', () =>
          Effect.sync(() => {
            pressButton('rename')
          })),
        Then('the original atom is still on screen')((_s, expect) =>
          Effect.promise(() => screen.findByTestId('kept-name')).pipe(
            Effect.map((keptName) => expect(keptName).toHaveTextContent('Ada')),
          )
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
              const Counter = AtomReact.make(() => Atom.make(0))
              function Widget() {
                const atom = Counter.use()
                const value = AtomReact.useAtomValue(atom)
                return createElement('div', { 'data-testid': 'unscoped-value' }, value)
              }
              render(
                createElement(
                  AtomReact.RegistryContext.Provider,
                  { value: Atom.Registry.make() },
                  createElement(
                    ErrorBoundary,
                    { fallback: createElement('div', { 'data-testid': 'missing-provider' }, 'provider missing') },
                    createElement(Widget),
                  ),
                ),
              )
              return {}
            }),
        ),
        When('the widget is shown')('shown', () => Effect.succeed(true)),
        Then('the error boundary reports the missing provider')((_s, expect) =>
          Effect.promise(() => screen.findByTestId('missing-provider')).pipe(
            Effect.map((missingProvider) => expect(missingProvider).toHaveTextContent('provider missing')),
          )
        ),
      ),
    )
  })
