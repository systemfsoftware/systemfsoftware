import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { act, render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as React from 'react'
import { ErrorBoundary, getErrorMessage } from 'react-error-boundary'
import { expect } from 'vitest'

const Feature = makeFeature({ it })

Feature('Keeping a shared registry alive')
  .live('renders a real page in Chromium and waits on browser timers')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A widget under a provider reads the value that provider holds',
      Gherkin.Do.pipe(
        Given('a widget showing a value under its own provider')('ctx', () =>
          Effect.sync(() => {
            const rating = Atom.make(0)
            function Widget() {
              const value = AtomReact.useAtomValue(rating)
              return React.createElement('div', { 'data-testid': 'provided-rating' }, value)
            }
            render(React.createElement(AtomReact.RegistryProvider, null, React.createElement(Widget)))
            return {}
          })),
        When('the widget is shown')('shown', () => Effect.succeed(true)),
        Then('the value the provider starts with is on screen')(() =>
          Effect.promise(function() {
            return expect.element(screen.getByTestId('provided-rating')).toHaveTextContent('0')
          })
        ),
      ),
    )

    scenario(
      'A widget shown without any provider reports that a provider is required',
      Gherkin.Do.pipe(
        Given('a widget reading a value with no provider anywhere above it, inside an error boundary')(
          'ctx',
          () =>
            Effect.sync(() => {
              const rating = Atom.make(0)
              function Widget() {
                const value = AtomReact.useAtomValue(rating)
                return React.createElement('div', { 'data-testid': 'unprovided-value' }, value)
              }
              render(
                React.createElement(
                  ErrorBoundary,
                  {
                    fallbackRender: ({ error }) =>
                      React.createElement(
                        'div',
                        { 'data-testid': 'missing-registry' },
                        getErrorMessage(error) ?? 'no message given',
                      ),
                  },
                  React.createElement(Widget),
                ),
              )
              return {}
            }),
        ),
        When('the widget is shown')('shown', () => Effect.succeed(true)),
        Then('the error message says a provider is what supplies the data source')(() =>
          Effect.promise(function() {
            return screen.findByTestId('missing-registry').then((notice) => {
              expect(notice.textContent).toContain('RegistryProvider')
              expect(screen.queryByTestId('unprovided-value')).toBeNull()
            })
          })
        ),
      ),
    )

    scenario(
      'Two providers side by side keep their own values for the same shared value',
      Gherkin.Do.pipe(
        Given('two providers next to each other, each holding a different starting value for one shared value')(
          'ctx',
          () =>
            Effect.sync(() => {
              const rating = Atom.make(0)
              function Widget({ id, starting }: { readonly id: string; readonly starting: number }) {
                AtomReact.useAtomInitialValues([[rating, starting]])
                const value = AtomReact.useAtomValue(rating)
                return React.createElement('div', { 'data-testid': id }, value)
              }
              render(
                React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(
                    AtomReact.RegistryProvider,
                    null,
                    React.createElement(Widget, { id: 'left-rating', starting: 2 }),
                  ),
                  React.createElement(
                    AtomReact.RegistryProvider,
                    null,
                    React.createElement(Widget, { id: 'right-rating', starting: 6 }),
                  ),
                ),
              )
              return {}
            }),
        ),
        When('both widgets are shown')('shown', () => Effect.succeed(true)),
        Then('each widget shows the value its own provider holds')(() =>
          Effect.promise(function leftProvider() {
            return expect.element(screen.getByTestId('left-rating')).toHaveTextContent('2').then(
              function rightProvider() {
                return expect.element(screen.getByTestId('right-rating')).toHaveTextContent('6')
              },
            )
          })
        ),
      ),
    )

    scenario(
      'A provider that re-renders keeps serving the same registry',
      Gherkin.Do.pipe(
        Given('a page under a strict provider that can be re-rendered')('ctx', () =>
          Effect.sync(() => {
            const count = Atom.make(0)
            const seenRegistries: Atom.Registry.Registry[] = []
            let tick: () => void = () => {
              throw new Error('tick called before the page rendered')
            }
            function Page() {
              seenRegistries.push(AtomReact.useRegistry())
              const [n, setN] = React.useState(0)
              tick = () => setN((x) => x + 1)
              const value = AtomReact.useAtomValue(count)
              return React.createElement('div', { 'data-testid': 'stable-count' }, n, ':', value)
            }
            render(
              React.createElement(
                React.StrictMode,
                null,
                React.createElement(AtomReact.RegistryProvider, null, React.createElement(Page)),
              ),
            )
            return { tick: () => tick, seenRegistries }
          })),
        When('the page is re-rendered')('done', (s) =>
          Effect.sync(() => {
            act(() => {
              s.ctx.tick()
            })
          })),
        Then('every render saw the same registry')((s) => {
          expect(new Set(s.ctx.seenRegistries).size).toBe(1)
        }),
      ),
    )
  })
