/**
 * Server-side rendering scenarios for the React atom hooks.
 *
 * These scenarios run in a dedicated node-mode Vitest project
 * (`test.projects[].node` in `vitest.config.ts`) because the browser-mode
 * suite cannot exercise `useSyncExternalStore`'s server-snapshot path: the
 * node project renders components with `renderToString` from
 * `react-dom/server`, which calls `getServerSnapshot` for every store read.
 *
 * @since 4.0.0
 */
import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as Hydration from '@systemfsoftware/effect-atom/Hydration'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import * as AsyncResult from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Latch from 'effect/Latch'
import * as Schema from 'effect/Schema'
import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { expect, vi } from 'vitest'
import { HydrationBoundary, RegistryContext, useAtomValue } from '../src/index.js'

const Feature = makeFeature({ it, layer })

Feature('Server-side rendering of React atom hooks')
  .body(({ scenario }) => {
    scenario(
      'Atoms run during SSR when no server snapshot is given',
      Gherkin.Do.pipe(
        Given('an atom whose read runs the atom function during SSR')('ctx', () =>
          Effect.sync(() => {
            const getCount = vi.fn<() => number>(() => 0)
            const counterAtom = Atom.make(getCount)

            function TestComponent() {
              const count = useAtomValue(counterAtom)
              return React.createElement('div', null, count)
            }

            const ssrHtml = renderToString(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make() },
                React.createElement(TestComponent),
              ),
            )
            return { getCount, ssrHtml }
          })),
        When('the rendered markup is inspected')('result', (s) => Effect.sync(() => s.ctx)),
        Then('the atom read function was called and the value is in the markup')((s) => {
          expect(s.result.getCount).toHaveBeenCalled()
          expect(s.result.ssrHtml).toContain('0')
        }),
      ),
    )

    scenario(
      'Atoms with a server snapshot skip their effects during SSR',
      Gherkin.Do.pipe(
        Given('an atom with a configured server snapshot')('ctx', () =>
          Effect.sync(() => {
            const mockFetchData = vi.fn<() => number>(() => 0)
            const userDataAtom = Atom.make(Effect.sync(() => mockFetchData())).pipe(Atom.withServerValueInitial)
            const registry = AtomRegistry.make()

            function TestComponent() {
              const result = useAtomValue(userDataAtom)
              return React.createElement(
                'div',
                null,
                AsyncResult.match(result, {
                  onInitial: () => 'Initial',
                  onSuccess: () => 'Success',
                  onFailure: () => 'Failure',
                }),
              )
            }

            const ssrHtml = renderToString(
              React.createElement(
                RegistryContext.Provider,
                { value: registry },
                React.createElement(TestComponent),
              ),
            )
            expect(mockFetchData).not.toHaveBeenCalled()
            expect(ssrHtml).toContain('Initial')
            return { mockFetchData, ssrHtml, registry, userDataAtom }
          })),
        When('the server markup is observed and the client reads the atom')('result', (s) =>
          Effect.sync(() => {
            const clientValue = s.ctx.registry.get(s.ctx.userDataAtom)
            return { clientValue }
          })),
        Then('the client read ran the effect and settled the atom')((s) => {
          expect(s.ctx.mockFetchData).toHaveBeenCalled()
          expect(AsyncResult.isSuccess(s.result.clientValue)).toBe(true)
        }),
      ),
    )

    scenario(
      'Dehydrated server state is hydrated from the server snapshot',
      Gherkin.Do.pipe(
        Given('dehydrated state for serializable atoms rendered inside a hydration boundary')(
          'ctx',
          () =>
            Effect.sync(() => {
              const atomBasic = Atom.make(0).pipe(
                Atom.serializable({
                  key: 'basic',
                  schema: Schema.Number,
                }),
              )
              const makeAtomResult = (key: string, effect: Effect.Effect<number, string>) =>
                Atom.make(effect).pipe(
                  Atom.serializable({
                    key,
                    schema: AsyncResult.Schema({
                      success: Schema.Number,
                      error: Schema.String,
                    }),
                  }),
                )

              const atomResult1 = makeAtomResult('success', Effect.succeed(123))
              const atomResult2 = makeAtomResult('errored', Effect.fail('error'))
              const atomResult3 = makeAtomResult('pending', Effect.never)

              const serverRegistry = AtomRegistry.make()
              serverRegistry.set(atomBasic, 1)
              serverRegistry.mount(atomResult1)
              serverRegistry.mount(atomResult2)
              serverRegistry.mount(atomResult3)
              const dehydratedState = Hydration.dehydrate(serverRegistry, { encodeInitialAs: 'value-only' })

              function Basic() {
                const value = useAtomValue(atomBasic)
                return React.createElement('div', { 'data-testid': 'value' }, value)
              }

              function Result1() {
                const value = useAtomValue(atomResult1)
                return AsyncResult.match(value, {
                  onSuccess: (success) => React.createElement('div', { 'data-testid': 'value-1' }, success.value),
                  onFailure: () => React.createElement('div', { 'data-testid': 'error-1' }, 'Error'),
                  onInitial: () => React.createElement('div', { 'data-testid': 'loading-1' }, 'Loading...'),
                })
              }

              function Result2() {
                const value = useAtomValue(atomResult2)
                return AsyncResult.match(value, {
                  onSuccess: (success) => React.createElement('div', { 'data-testid': 'value-2' }, success.value),
                  onFailure: () => React.createElement('div', { 'data-testid': 'error-2' }, 'Error'),
                  onInitial: () => React.createElement('div', { 'data-testid': 'loading-2' }, 'Loading...'),
                })
              }

              function Result3() {
                const value = useAtomValue(atomResult3)
                return AsyncResult.match(value, {
                  onSuccess: (success) => React.createElement('div', { 'data-testid': 'value-3' }, success.value),
                  onFailure: () => React.createElement('div', { 'data-testid': 'error-3' }, 'Error'),
                  onInitial: () => React.createElement('div', { 'data-testid': 'loading-3' }, 'Loading...'),
                })
              }

              const ssrHtml = renderToString(
                React.createElement(
                  RegistryContext.Provider,
                  { value: AtomRegistry.make() },
                  React.createElement(
                    HydrationBoundary,
                    { state: dehydratedState },
                    React.createElement(Basic),
                    React.createElement(Result1),
                    React.createElement(Result2),
                    React.createElement(Result3),
                  ),
                ),
              )
              return { ssrHtml }
            }),
        ),
        When('the rendered markup is inspected')('result', () => Effect.sync(() => true)),
        Then('the dehydrated values are present in the markup')((s) => {
          expect(s.ctx.ssrHtml).toContain('data-testid="value">1<')
          expect(s.ctx.ssrHtml).toContain('data-testid="value-1">123<')
          expect(s.ctx.ssrHtml).toContain('data-testid="error-2">Error<')
          expect(s.ctx.ssrHtml).toContain('data-testid="loading-3">Loading...<')
        }),
      ),
    )

    scenario(
      'Deferred hydration state is applied when the streaming promise settles',
      Gherkin.Do.pipe(
        Given('a pending serializable atom dehydrated as a deferred promise')('ctx', () =>
          Effect.promise(async () => {
            const latch = Latch.makeUnsafe()
            let start = 0
            let stop = 0
            const atom = Atom.make(
              Effect.gen(function*() {
                start = start + 1
                yield* latch.await
                stop = stop + 1
                return 1
              }),
            ).pipe(
              Atom.serializable({
                key: 'test',
                schema: AsyncResult.Schema({
                  success: Schema.Number,
                }),
              }),
            )

            const serverRegistry = AtomRegistry.make()
            serverRegistry.mount(atom)

            const before = { start, stop }

            const dehydratedState = Hydration.dehydrate(serverRegistry, {
              encodeInitialAs: 'deferred',
            })

            function TestComponent() {
              const value = useAtomValue(atom)
              return React.createElement(
                'div',
                null,
                AsyncResult.match(value, {
                  onInitial: () => 'Initial',
                  onSuccess: () => 'Success',
                  onFailure: () => 'Failure',
                }),
              )
            }

            const hydrationRegistry = AtomRegistry.make()
            const ssrHtml = renderToString(
              React.createElement(
                RegistryContext.Provider,
                { value: hydrationRegistry },
                React.createElement(
                  HydrationBoundary,
                  { state: dehydratedState },
                  React.createElement(TestComponent),
                ),
              ),
            )
            return { atom, before, hydrationRegistry, latch, ssrHtml, readCounters: () => ({ start, stop }) }
          })),
        When('the server-side value settles and the streaming data is applied')(
          'settled',
          (s) =>
            Effect.promise(async () => {
              Effect.runSync(s.ctx.latch.open)
              await Effect.runPromise(s.ctx.latch.await)
              await vi.waitFor(() => {
                const snapshot = s.ctx.hydrationRegistry.get(s.ctx.atom)
                expect(AsyncResult.isSuccess(snapshot)).toBe(true)
              })
              return AsyncResult.getOrThrow(s.ctx.hydrationRegistry.get(s.ctx.atom))
            }),
        ),
        Then('the deferred value is applied to the hydration registry once')((s) => {
          expect(s.ctx.before.start).toBe(1)
          expect(s.ctx.before.stop).toBe(0)
          expect(s.ctx.ssrHtml).toContain('Initial')
          const counters = s.ctx.readCounters()
          expect(counters.start).toBe(1)
          expect(s.settled).toBe(1)
          expect(counters.stop).toBe(1)
        }),
      ),
    )
  })
