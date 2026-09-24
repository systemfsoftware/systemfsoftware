import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as AsyncResult from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { act, render, screen } from '@testing-library/react'
import { renderSuspending } from './__fixtures__/render-suspending.js'
import '@vitest/browser/matchers'
import { RegistryProvider, useAtomSuspense } from '@systemfsoftware/effect-atom-react'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as React from 'react'
import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

function waitingNote() {
  return React.createElement('div', { 'data-testid': 'waiting-note' }, 'still waiting')
}

Feature('Suspending a screen until its value is ready')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A screen that waits for a value shows a note while waiting and the value once it arrives',
      Gherkin.Do.pipe(
        Given('a value delivered from outside and a screen that waits for it behind a waiting note')(
          'ctx',
          () =>
            Effect.suspend(() => {
              const source = Deferred.makeUnsafe<number>()
              const loaded = Atom.make(source.pipe(Deferred.await))
              function Screen() {
                const result = useAtomSuspense(loaded, { suspendOnWaiting: true })
                return React.createElement('div', { 'data-testid': 'arrived-value' }, AsyncResult.getOrThrow(result))
              }
              return renderSuspending(
                React.createElement(
                  RegistryProvider,
                  null,
                  React.createElement(Suspense, { fallback: waitingNote() }, React.createElement(Screen)),
                ),
              ).pipe(Effect.as({ source }))
            }),
        ),
        When('the value is delivered')(
          'seen',
          (s) =>
            Effect.sync(() => screen.queryByTestId('waiting-note') !== null).pipe(
              Effect.tap(() =>
                Effect.promise(() => Promise.resolve(act(() => Effect.runPromise(Deferred.succeed(s.ctx.source, 9)))))
              ),
              Effect.map((noteWhileWaiting) => ({ noteWhileWaiting })),
            ),
        ),
        Then('the note was shown while waiting, and now the value is on screen and the note is gone')((s) =>
          Effect.promise(function showValue() {
            return screen.findByTestId('arrived-value').then(function hideNote(arrived) {
              expect(s.seen.noteWhileWaiting).toBe(true)
              expect(arrived.textContent).toBe('9')
              expect(screen.queryByTestId('waiting-note')).toBeNull()
            })
          })
        ),
      ),
    )

    scenario(
      'Two screens waiting on the same value both appear after it is delivered once',
      Gherkin.Do.pipe(
        Given('one value delivered from outside with two screens waiting on it')('ctx', () =>
          Effect.suspend(() => {
            const source = Deferred.makeUnsafe<number>()
            const loaded = Atom.make(source.pipe(Deferred.await))
            function Screen({ id }: { readonly id: string }) {
              const result = useAtomSuspense(loaded, { suspendOnWaiting: true })
              return React.createElement('div', { 'data-testid': `${id}-value` }, AsyncResult.getOrThrow(result))
            }
            return renderSuspending(
              React.createElement(
                RegistryProvider,
                null,
                React.createElement(
                  Suspense,
                  { fallback: waitingNote() },
                  React.createElement(Screen, { id: 'left' }),
                  React.createElement(Screen, { id: 'right' }),
                ),
              ),
            ).pipe(Effect.as({ source }))
          })),
        When('the value is delivered once')('done', (s) =>
          Effect.promise(() => {
            const next = act(() => Effect.runPromise(Deferred.succeed(s.ctx.source, 4)))
            return Promise.resolve(next)
          })),
        Then('both screens show the delivered value and the note is gone')(() =>
          Effect.promise(function bothScreens() {
            return Promise.all([screen.findByTestId('left-value'), screen.findByTestId('right-value')]).then(
              function hideNote([left, right]) {
                expect(left.textContent).toBe('4')
                expect(right.textContent).toBe('4')
                expect(screen.queryByTestId('waiting-note')).toBeNull()
              },
            )
          })
        ),
      ),
    )

    scenario(
      'A value that goes wrong shows the nearest notice instead of the screen',
      Gherkin.Do.pipe(
        Given('a screen waiting on a value that goes wrong, above a notice')('ctx', () =>
          Effect.sync(() => {
            const broken = Atom.make(Effect.fail('unavailable'))
            function Screen() {
              useAtomSuspense(broken)
              return React.createElement('div', { 'data-testid': 'never-screen' }, 'unexpected')
            }
            render(
              React.createElement(
                RegistryProvider,
                null,
                React.createElement(
                  ErrorBoundary,
                  { fallback: React.createElement('div', { 'data-testid': 'problem-note' }, 'could not load') },
                  React.createElement(
                    Suspense,
                    { fallback: waitingNote() },
                    React.createElement(Screen),
                  ),
                ),
              ),
            )
            return {}
          })),
        When('the broken value settles')('shown', () => Effect.succeed(true)),
        Then('the notice is on screen and the screen is not rendered')(() =>
          Effect.promise(function showNote() {
            return expect.element(screen.getByTestId('problem-note')).toHaveTextContent('could not load').then(
              function hideScreen() {
                expect(screen.queryByTestId('never-screen')).toBeNull()
              },
            )
          })
        ),
      ),
    )
  })
