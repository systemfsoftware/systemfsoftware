import { expect } from '@effect/vitest'
import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { act, render, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as React from 'react'
import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { renderCleanupLayer } from './__fixtures__/render-cleanup.js'
import { renderSuspending } from './__fixtures__/render-suspending.js'
import { Unavailable } from './__fixtures__/Unavailable.schema.js'

const Feature = makeFeature({ it })

Feature('Waiting for asynchronous values')
  .live('renders real components in Chromium and waits on React commits in the browser')
  .withLayer(Layer.empty)
  .withScenarioLayer(renderCleanupLayer)
  .body(({ scenario }) => {
    scenario(
      'A reader who waits through loading sees the value once it arrives',
      Gherkin.Do.pipe(
        Given('a value that arrives once it is delivered and a widget that waits through loading')(
          'ctx',
          () =>
            Effect.suspend(() => {
              const source = Deferred.makeUnsafe<number>()
              const loaded = Atom.make(source.pipe(Deferred.await))
              function Widget() {
                const result = AtomReact.useAtomSuspense(loaded, { suspendOnWaiting: true })
                return React.createElement(
                  'div',
                  { 'data-testid': 'loaded-value' },
                  Atom.AsyncResult.getOrThrow(result),
                )
              }
              return renderSuspending(
                React.createElement(
                  AtomReact.RegistryContext.Provider,
                  { value: Atom.Registry.make() },
                  React.createElement(
                    Suspense,
                    { fallback: React.createElement('div', { 'data-testid': 'loading' }, 'loading') },
                    React.createElement(Widget),
                  ),
                ),
              ).pipe(Effect.as({ source }))
            }),
        ),
        When('the value is delivered to the widget')(
          'settled',
          (s) =>
            Effect.promise(() => {
              const next = act(() => Effect.runPromise(Deferred.succeed(s.ctx.source, 5)))
              return Promise.resolve(next)
            }),
        ),
        Then('the loaded value is on screen')(() =>
          Effect.promise(() => screen.findByTestId('loaded-value')).pipe(
            Effect.tap((el) =>
              Effect.sync(() => {
                expect(el).toHaveTextContent('5')
              })
            ),
          )
        ),
      ),
    )

    scenario(
      'A reader who waits through a refresh sees the refreshed value',
      Gherkin.Do.pipe(
        Given('a value that reloads on demand and a widget that waits through loading')(
          'ctx',
          () =>
            Effect.suspend(() => {
              const pending: Deferred.Deferred<number>[] = []
              const loaded = Atom.make(
                Effect.gen(function*() {
                  const current = Deferred.makeUnsafe<number>()
                  pending.push(current)
                  return yield* Deferred.await(current)
                }),
              )
              let refresh: () => void = () => {
                throw new Error('refresh called before the widget rendered')
              }
              function Widget() {
                refresh = AtomReact.useAtomRefresh(loaded)
                const result = AtomReact.useAtomSuspense(loaded, { suspendOnWaiting: true })
                return React.createElement(
                  'div',
                  { 'data-testid': 'refreshed-value' },
                  Atom.AsyncResult.getOrThrow(result),
                )
              }
              return renderSuspending(
                React.createElement(
                  AtomReact.RegistryContext.Provider,
                  { value: Atom.Registry.make() },
                  React.createElement(
                    Suspense,
                    { fallback: React.createElement('div', { 'data-testid': 'refreshing' }, 'loading') },
                    React.createElement(Widget),
                  ),
                ),
              ).pipe(Effect.as({ pending, refresh: () => refresh }))
            }),
        ),
        When('the first value arrives, the reader asks for a refresh, and the newer value arrives')(
          'settled',
          (s) =>
            Effect.promise(() => {
              const [firstPending] = s.ctx.pending
              if (firstPending === undefined) {
                throw new Error('expected a pending deferred')
              }
              return Promise.resolve(act(() => Effect.runPromise(Deferred.succeed(firstPending, 1))))
                .then(function firstValue() {
                  return expect.element(screen.getByTestId('refreshed-value')).toHaveTextContent('1')
                })
                .then(function refresh() {
                  return Promise.resolve(act(() => {
                    s.ctx.refresh()()
                  }))
                })
                .then(function waitPending() {
                  return expect.poll(() => s.ctx.pending.length).toBe(2)
                })
                .then(function secondValue() {
                  const secondPending = s.ctx.pending[1]
                  if (secondPending === undefined) {
                    throw new Error('expected a second pending deferred')
                  }
                  return Promise.resolve(act(() => Effect.runPromise(Deferred.succeed(secondPending, 2))))
                })
            }),
        ),
        Then('the widget shows the refreshed value')(() =>
          Effect.promise(function showRefreshed() {
            return expect.element(screen.getByTestId('refreshed-value')).toHaveTextContent('2')
          })
        ),
      ),
    )

    scenario(
      'A reader who does not accept failures sees the error message instead of the widget',
      Gherkin.Do.pipe(
        Given('a widget backed by a value that fails, wrapped in an error boundary')('ctx', () =>
          Effect.sync(() => {
            const failing = Atom.make(Unavailable.make({}).pipe(Effect.fail))
            function Widget() {
              AtomReact.useAtomSuspense(failing)
              return React.createElement('div', { 'data-testid': 'unexpected-widget' }, 'unexpected')
            }
            render(
              React.createElement(
                AtomReact.RegistryContext.Provider,
                { value: Atom.Registry.make() },
                React.createElement(
                  ErrorBoundary,
                  { fallback: React.createElement('div', { 'data-testid': 'failure-message' }, 'failed to load') },
                  React.createElement(
                    Suspense,
                    { fallback: React.createElement('div', { 'data-testid': 'waiting' }, 'loading') },
                    React.createElement(Widget),
                  ),
                ),
              ),
            )
            return {}
          })),
        When('the widget is shown')('shown', () => Effect.succeed(true)),
        Then('the error boundary shows the failure message and the widget is not rendered')(() =>
          Effect.promise(function() {
            return expect.element(screen.getByTestId('failure-message')).toHaveTextContent('failed to load').then(
              () => {
                expect(screen.queryByTestId('unexpected-widget')).toBeNull()
              },
            )
          })
        ),
      ),
    )
  })
