import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { vi } from '@systemfsoftware/vitest'
import { render, renderHook, screen } from '@testing-library/react'
import '@vitest/browser/matchers'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { createElement, Fragment, type ReactNode, StrictMode, Suspense, use, useState, useTransition } from 'react'
import { ErrorBoundary, getErrorMessage } from 'react-error-boundary'
import { findWidgetShowing } from './__fixtures__/find-widget.js'
import { pressButton, withRegistry } from './__fixtures__/registry-wrapper.js'
import { ownRegistry, renderCleanupLayer } from './__fixtures__/render-cleanup.js'
import { renderSuspending } from './__fixtures__/render-suspending.js'

const Feature = makeFeature({ it })

const watchedValue = (lifecycle: string[]) =>
  Atom.make((get) => {
    lifecycle.push('computed')
    get.addFinalizer(() => lifecycle.push('released'))
    return 0
  })

const registryWorkSettled = Effect.callback<void>((resume) => {
  const cancel = AtomReact.scheduleTask(() => resume(Effect.void))
  return Effect.sync(cancel)
})

Feature('Keeping a shared registry alive')
  .live('renders a real page in Chromium and waits on browser timers')
  .withLayer(Layer.empty)
  .withScenarioLayer(renderCleanupLayer)
  .body(({ scenario }) => {
    scenario(
      'A widget under a provider reads the value that provider holds',
      Gherkin.Do.pipe(
        Given('a widget showing a value under its own provider')('ctx', () =>
          Effect.sync(() => {
            const rating = Atom.make(0)
            function Widget() {
              const value = AtomReact.useAtomValue(rating)
              return createElement('div', { 'data-testid': 'provided-rating' }, value)
            }
            render(createElement(AtomReact.RegistryProvider, { registry: ownRegistry() }, createElement(Widget)))
            return {}
          })),
        When('the widget is shown')('shown', () => Effect.succeed(true)),
        Then('the value the provider starts with is on screen')((_s, expect) =>
          Effect.promise(() => screen.findByTestId('provided-rating')).pipe(
            Effect.map((rating) => expect(rating).toHaveTextContent('0')),
          )
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
                return createElement('div', { 'data-testid': 'unprovided-value' }, value)
              }
              render(
                createElement(
                  ErrorBoundary,
                  {
                    fallbackRender: ({ error }) =>
                      createElement(
                        'div',
                        { 'data-testid': 'missing-registry' },
                        getErrorMessage(error) ?? 'no message given',
                      ),
                  },
                  createElement(Widget),
                ),
              )
              return {}
            }),
        ),
        When('the widget is shown')('shown', () => Effect.succeed(true)),
        Then('the error message says a provider is what supplies the data source')((_s, expect) =>
          Effect.promise(() => screen.findByTestId('missing-registry')).pipe(
            Effect.map((notice) =>
              expect({ notice: notice.textContent, unprovidedValue: screen.queryByTestId('unprovided-value') })
                .toMatchObject({
                  notice: expect.stringMatching(/RegistryProvider/),
                  unprovidedValue: null,
                })
            ),
          )
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
              function Widget({ id }: { readonly id: string }) {
                const value = AtomReact.useAtomValue(rating)
                return createElement('div', { 'data-testid': id }, value)
              }
              render(
                createElement(
                  Fragment,
                  null,
                  createElement(
                    AtomReact.RegistryProvider,
                    { registry: ownRegistry([[rating, 2]]) },
                    createElement(Widget, { id: 'left-rating' }),
                  ),
                  createElement(
                    AtomReact.RegistryProvider,
                    { registry: ownRegistry([[rating, 6]]) },
                    createElement(Widget, { id: 'right-rating' }),
                  ),
                ),
              )
              return {}
            }),
        ),
        When('both widgets are shown')('shown', () => Effect.succeed(true)),
        Then('each widget shows the value its own provider holds')((_s, expect) =>
          Effect.promise(() => Promise.all([screen.findByTestId('left-rating'), screen.findByTestId('right-rating')]))
            .pipe(
              Effect.map(([left, right]) =>
                expect({ left: left.textContent, right: right.textContent }).toEqual({ left: '2', right: '6' })
              ),
            )
        ),
      ),
    )

    scenario(
      'A strict page that mounts twice and re-renders keeps its value computed once and held',
      Gherkin.Do.pipe(
        Given('a page under StrictMode that keeps a value alive in the registry its owner made')(
          'ctx',
          () =>
            Effect.sync(() => {
              const lifecycle: string[] = []
              const watched = watchedValue(lifecycle)
              const registry = ownRegistry()
              const seenRegistries: Atom.Registry.Registry[] = []
              function Page() {
                seenRegistries.push(AtomReact.useRegistry())
                AtomReact.useAtomMount(watched)
                const [renders, setRenders] = useState(0)
                return createElement(
                  'button',
                  { type: 'button', onClick: () => setRenders((n) => n + 1) },
                  `re-render ${renders}`,
                )
              }
              render(
                createElement(
                  StrictMode,
                  null,
                  createElement(AtomReact.RegistryProvider, { registry }, createElement(Page)),
                ),
              )
              return { lifecycle, registry, seenRegistries }
            }),
        ),
        When('the page is re-rendered and the registry has run its queued work')(
          'done',
          () => Effect.sync(() => pressButton('re-render 0')).pipe(Effect.andThen(registryWorkSettled)),
        ),
        Then("the value was computed once and is still held, and every render saw the owner's registry")((
          s,
          expect,
        ) =>
          expect({ lifecycle: s.ctx.lifecycle, seen: [...new Set(s.ctx.seenRegistries)] }).toEqual({
            lifecycle: ['computed'],
            seen: [s.ctx.registry],
          })
        ),
      ),
    )

    scenario(
      "A section whose loading never finishes reads the owner's registry and leaves nothing running",
      Gherkin.Do.pipe(
        Given('a page that starts loading a section which reads a value and then waits forever')(
          'ctx',
          () =>
            Effect.sync(() => {
              const lifecycle: string[] = []
              const watched = watchedValue(lifecycle)
              const registry = ownRegistry()
              const seenRegistries: Atom.Registry.Registry[] = []
              const neverLoads = Effect.runPromise(Effect.never)
              function NeverLoads(): ReactNode {
                seenRegistries.push(AtomReact.useRegistry())
                AtomReact.useAtomValue(watched)
                return use(neverLoads)
              }
              function Page() {
                const [loading, setLoading] = useState(false)
                const [, startTransition] = useTransition()
                return createElement(
                  Fragment,
                  null,
                  createElement('div', { 'data-testid': 'section' }, loading ? 'loading' : 'idle'),
                  createElement('button', {
                    type: 'button',
                    onClick: () => startTransition(() => setLoading(true)),
                  }, 'load section'),
                  loading ? createElement(NeverLoads) : null,
                )
              }
              render(
                createElement(
                  AtomReact.RegistryProvider,
                  { registry },
                  createElement(Suspense, { fallback: null }, createElement(Page)),
                ),
              )
              return { lifecycle, registry, seenRegistries }
            }),
        ),
        When('the section starts loading and the registry releases what its render read')(
          'shown',
          (s) =>
            Effect.sync(() => pressButton('load section')).pipe(
              Effect.andThen(Effect.promise(() =>
                vi.waitFor(() => {
                  if (!s.ctx.lifecycle.includes('released')) {
                    throw new Error('the value the loading section read is still held')
                  }
                })
              )),
              Effect.andThen(Effect.promise(() => findWidgetShowing({ testId: 'section', text: 'idle' }))),
            ),
        ),
        Then("the page never committed the section, its value was released, and it read the owner's registry")((
          s,
          expect,
        ) =>
          expect({
            section: s.shown.textContent,
            lifecycle: s.ctx.lifecycle,
            seen: [...new Set(s.ctx.seenRegistries)],
          }).toEqual({
            section: 'idle',
            lifecycle: ['computed', 'released'],
            seen: [s.ctx.registry],
          })
        ),
      ),
    )

    scenario(
      'A provider below a waiting note shows the value once it arrives, from one registry',
      Gherkin.Do.pipe(
        Given('a provider inside a waiting note whose widget waits on a slow value the first time it mounts')(
          'ctx',
          () =>
            Effect.suspend(() => {
              const counts = { runs: 0 }
              const slow = Atom.make(
                Effect.sync(() => {
                  counts.runs += 1
                }).pipe(Effect.andThen(Effect.sleep('50 millis')), Effect.as(7)),
              )
              const registry = ownRegistry()
              const seenRegistries: Atom.Registry.Registry[] = []
              function Widget() {
                seenRegistries.push(AtomReact.useRegistry())
                const result = AtomReact.useAtomSuspense(slow)
                return createElement('div', { 'data-testid': 'slow-value' }, Atom.AsyncResult.getOrThrow(result))
              }
              return renderSuspending(
                createElement(
                  Suspense,
                  { fallback: createElement('div', null, 'waiting') },
                  createElement(AtomReact.RegistryProvider, { registry }, createElement(Widget)),
                ),
              ).pipe(Effect.as({ counts, registry, seenRegistries }))
            }),
        ),
        When('the value arrives')(
          'shown',
          () => Effect.promise(() => findWidgetShowing({ testId: 'slow-value', text: '7' })),
        ),
        Then('the value shows, every attempt saw the one registry, and the value ran at most once per attempt')((
          s,
          expect,
        ) =>
          expect({
            shown: s.shown.textContent,
            seen: [...new Set(s.ctx.seenRegistries)],
            ranAtMostOncePerAttempt: s.ctx.counts.runs <= s.ctx.seenRegistries.length,
          }).toEqual({ shown: '7', seen: [s.ctx.registry], ranAtMostOncePerAttempt: true })
        ),
      ),
    )

    scenario(
      'A page that leaves keeps its registry until the owner puts it away',
      Gherkin.Do.pipe(
        Given('a page showing a value kept alive in the registry its owner made')('ctx', () =>
          Effect.sync(() => {
            const lifecycle: string[] = []
            const kept = Atom.make((get) => {
              lifecycle.push('computed')
              get.addFinalizer(() => lifecycle.push('released'))
              return 5
            }).pipe(Atom.keepAlive)
            const registry = ownRegistry()
            function Widget() {
              return createElement('div', { 'data-testid': 'kept' }, AtomReact.useAtomValue(kept))
            }
            const { unmount } = render(createElement(AtomReact.RegistryProvider, { registry }, createElement(Widget)))
            return { kept, lifecycle, registry, unmount }
          })),
        When('the page leaves, the registry runs its queued work, and the owner then disposes it')(
          'done',
          (s) =>
            Effect.promise(() => findWidgetShowing({ testId: 'kept', text: '5' })).pipe(
              Effect.andThen(Effect.sync(() => s.ctx.unmount())),
              Effect.andThen(registryWorkSettled),
              Effect.map(() => {
                const readAfterUnmount = Atom.Registry.get(s.ctx.registry, s.ctx.kept)
                const afterUnmount = [...s.ctx.lifecycle]
                Atom.Registry.dispose(s.ctx.registry)
                return { readAfterUnmount, afterUnmount }
              }),
            ),
        ),
        Then('the registry still answered after the page left, and the value was released only by the owner')((
          s,
          expect,
        ) =>
          expect({ ...s.done, afterDispose: s.ctx.lifecycle }).toEqual({
            readAfterUnmount: 5,
            afterUnmount: ['computed'],
            afterDispose: ['computed', 'released'],
          })
        ),
      ),
    )

    scenario(
      'A widget that only keeps a value alive computes it once and releases it when it leaves the page',
      Gherkin.Do.pipe(
        Given('a widget that keeps a value alive without reading it')('ctx', () =>
          Effect.sync(() => {
            const lifecycle: string[] = []
            const watched = watchedValue(lifecycle)
            const { unmount } = renderHook(() => AtomReact.useAtomMount(watched), {
              wrapper: withRegistry(ownRegistry()),
            })
            return { lifecycle, unmount, whileShown: [...lifecycle] }
          })),
        When('the widget leaves the page')('done', (s) =>
          Effect.sync(() => {
            s.ctx.unmount()
          })),
        Then('the value was computed while shown and released afterwards')((s, expect) =>
          Effect.promise(() =>
            vi.waitFor(() => {
              if (!s.ctx.lifecycle.includes('released')) {
                throw new Error('the value is still held')
              }
            })
          ).pipe(
            Effect.map(() =>
              expect({ whileShown: s.ctx.whileShown, after: s.ctx.lifecycle }).toEqual({
                whileShown: ['computed'],
                after: ['computed', 'released'],
              })
            ),
          )
        ),
      ),
    )
  })
