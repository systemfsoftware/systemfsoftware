import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { act, render, screen } from '@testing-library/react'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as React from 'react'
import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { renderCleanupLayer } from './__fixtures__/render-cleanup.js'
import { renderSuspending } from './__fixtures__/render-suspending.js'

const Feature = makeFeature({ it })

function waitingNote() {
  return React.createElement('div', { 'data-testid': 'waiting-note' }, 'still waiting')
}

Feature('Suspending a screen until its value is ready')
  .live('renders a real suspending screen in Chromium and waits on React commits')
  .withLayer(Layer.empty)
  .withScenarioLayer(renderCleanupLayer)
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
                const result = AtomReact.useAtomSuspense(loaded, { suspendOnWaiting: true })
                return React.createElement(
                  'div',
                  { 'data-testid': 'arrived-value' },
                  Atom.AsyncResult.getOrThrow(result),
                )
              }
              return renderSuspending(
                React.createElement(
                  AtomReact.RegistryProvider,
                  null,
                  React.createElement(Suspense, { fallback: waitingNote() }, React.createElement(Screen)),
                ),
              ).pipe(Effect.as({ source }))
            }),
        ),
        When('the value is delivered')(
          'seen',
          (s) =>
            Effect.sync(() => ({ noteWhileWaiting: screen.queryByTestId('waiting-note')?.textContent ?? null })).pipe(
              Effect.tap(() =>
                Effect.promise(() => Promise.resolve(act(() => Effect.runPromise(Deferred.succeed(s.ctx.source, 9)))))
              ),
            ),
        ),
        Then('the note was shown while waiting, and now the value is on screen and the note is gone')((s, expect) =>
          Effect.promise(() => screen.findByTestId('arrived-value')).pipe(
            Effect.map((arrived) =>
              expect({
                arrived: arrived.textContent,
                noteNow: screen.queryByTestId('waiting-note'),
                noteWhileWaiting: s.seen.noteWhileWaiting,
              }).toEqual({ arrived: '9', noteNow: null, noteWhileWaiting: 'still waiting' })
            ),
          )
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
              const result = AtomReact.useAtomSuspense(loaded, { suspendOnWaiting: true })
              return React.createElement('div', { 'data-testid': `${id}-value` }, Atom.AsyncResult.getOrThrow(result))
            }
            return renderSuspending(
              React.createElement(
                AtomReact.RegistryProvider,
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
        Then('both screens show the delivered value and the note is gone')((_s, expect) =>
          Effect.promise(() => Promise.all([screen.findByTestId('left-value'), screen.findByTestId('right-value')]))
            .pipe(
              Effect.map(([left, right]) =>
                expect({
                  left: left.textContent,
                  note: screen.queryByTestId('waiting-note'),
                  right: right.textContent,
                }).toEqual({ left: '4', note: null, right: '4' })
              ),
            )
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
              AtomReact.useAtomSuspense(broken)
              return React.createElement('div', { 'data-testid': 'never-screen' }, 'unexpected')
            }
            render(
              React.createElement(
                AtomReact.RegistryProvider,
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
        Then('the notice is on screen and the screen is not rendered')((_s, expect) =>
          Effect.promise(() => screen.findByTestId('problem-note')).pipe(
            Effect.map((notice) =>
              expect({
                neverScreen: screen.queryByTestId('never-screen'),
                notice: notice.textContent,
              }).toEqual({ neverScreen: null, notice: 'could not load' })
            ),
          )
        ),
      ),
    )
  })
