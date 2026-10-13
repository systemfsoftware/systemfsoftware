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
import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { vi } from '@systemfsoftware/vitest'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Latch from 'effect/Latch'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

const Feature = makeFeature({ it })

Feature('Server-side rendering of React atom hooks')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Atoms run during SSR when no server snapshot is given',
      Gherkin.Do.pipe(
        Given('an atom whose read runs the atom function during SSR')('ctx', () =>
          Effect.sync(() => {
            let reads = 0
            const counterAtom = Atom.make(() => {
              reads += 1
              return 0
            })

            function TestComponent() {
              const count = AtomReact.useAtomValue(counterAtom)
              return createElement('div', null, count)
            }

            const ssrHtml = renderToString(
              createElement(
                AtomReact.RegistryContext.Provider,
                { value: Atom.Registry.make() },
                createElement(TestComponent),
              ),
            )
            return { reads: () => reads, ssrHtml }
          })),
        When('the rendered markup is inspected')('result', (s) => Effect.sync(() => s.ctx)),
        Then('the atom read function was called and the value is in the markup')((s, expect) =>
          expect({ html: s.result.ssrHtml, reads: s.result.reads() }).toEqual({
            html: '<div>0</div>',
            reads: 1,
          })
        ),
      ),
    )

    scenario(
      'Atoms with a server snapshot skip their effects during SSR',
      Gherkin.Do.pipe(
        Given('an atom with a configured server snapshot')('ctx', () =>
          Effect.sync(() => {
            const mockFetchData = vi.fn<() => number>(() => 0)
            const userDataAtom = Atom.make(Effect.sync(() => mockFetchData())).pipe(Atom.withServerValueInitial)
            const registry = Atom.Registry.make()

            function TestComponent() {
              const result = AtomReact.useAtomValue(userDataAtom)
              return createElement(
                'div',
                null,
                Atom.AsyncResult.match(result, {
                  onInitial: () => 'Initial',
                  onSuccess: () => 'Success',
                  onFailure: () => 'Failure',
                }),
              )
            }

            const ssrHtml = renderToString(
              createElement(
                AtomReact.RegistryContext.Provider,
                { value: registry },
                createElement(TestComponent),
              ),
            )
            return { mockFetchData, registry, ssrHtml, userDataAtom }
          })),
        Then('the server markup shows the atom has not run its effect yet')((s, expect) =>
          expect({ calls: s.ctx.mockFetchData.mock.calls, html: s.ctx.ssrHtml }).toMatchObject({
            calls: [],
            html: '<div>Initial</div>',
          })
        ),
        When('the server markup is observed and the client reads the atom')('result', (s) =>
          Effect.sync(() => {
            const clientValue = Atom.Registry.get(s.ctx.registry, s.ctx.userDataAtom)
            return { clientValue }
          })),
        Then('the client read ran the effect and settled the atom')((s, expect) =>
          expect({ calls: s.ctx.mockFetchData.mock.calls, clientValue: s.result.clientValue }).toMatchObject({
            calls: [[]],
            clientValue: { _tag: 'Success', value: 0 },
          })
        ),
      ),
    )

    scenario(
      'A request registry restored from dehydrated server state renders the saved values',
      Gherkin.Do.pipe(
        Given('dehydrated state for serializable atoms, restored into a registry made for this request')(
          'ctx',
          () =>
            Effect.sync(() => {
              const atomBasic = Atom.make(0).pipe(Atom.serializable({ key: 'owned-basic', schema: Schema.Finite }))
              const makeAtomResult = (key: string, effect: Effect.Effect<number, string>) =>
                Atom.make(effect).pipe(
                  Atom.serializable({
                    key,
                    schema: Atom.AsyncResult.Schema({ success: Schema.Finite, error: Schema.String }),
                  }),
                )
              const atomResult1 = makeAtomResult('owned-success', Effect.succeed(123))
              const atomResult2 = makeAtomResult('owned-errored', Effect.fail('error'))
              const atomResult3 = makeAtomResult('owned-pending', Effect.never)

              const serverRegistry = Atom.Registry.make()
              Atom.Registry.set(serverRegistry, atomBasic, 1)
              Atom.Registry.subscribe(serverRegistry, atomResult1, () => {}, { immediate: true })
              Atom.Registry.subscribe(serverRegistry, atomResult2, () => {}, { immediate: true })
              Atom.Registry.subscribe(serverRegistry, atomResult3, () => {}, { immediate: true })
              const dehydratedState = Atom.Hydration.dehydrate(serverRegistry, { encodeInitialAs: 'value-only' })

              const showResult = (testId: number, atom: typeof atomResult1) =>
                function Result() {
                  return Atom.AsyncResult.match(AtomReact.useAtomValue(atom), {
                    onSuccess: (success) => createElement('div', { 'data-testid': `value-${testId}` }, success.value),
                    onFailure: () => createElement('div', { 'data-testid': `error-${testId}` }, 'Error'),
                    onInitial: () => createElement('div', { 'data-testid': `loading-${testId}` }, 'Loading...'),
                  })
                }
              function Basic() {
                return createElement('div', { 'data-testid': 'value' }, AtomReact.useAtomValue(atomBasic))
              }

              const requestRegistry = Atom.Registry.make()
              Atom.Hydration.hydrate(requestRegistry, dehydratedState)
              const ssrHtml = renderToString(
                createElement(
                  AtomReact.RegistryProvider,
                  { registry: requestRegistry },
                  createElement(Basic),
                  createElement(showResult(1, atomResult1)),
                  createElement(showResult(2, atomResult2)),
                  createElement(showResult(3, atomResult3)),
                ),
              )
              Atom.Registry.dispose(requestRegistry)
              Atom.Registry.dispose(serverRegistry)
              return { ssrHtml }
            }),
        ),
        When('the rendered markup is inspected')('html', (s) => Effect.succeed(s.ctx.ssrHtml)),
        Then('the restored values are present in the markup')((s, expect) =>
          expect(s.html).toEqual(
            '<div data-testid="value">1</div>' +
              '<div data-testid="value-1">123</div>' +
              '<div data-testid="error-2">Error</div>' +
              '<div data-testid="loading-3">Loading...</div>',
          )
        ),
      ),
    )

    scenario(
      'A request registry completes a deferred entry when the server value settles',
      Gherkin.Do.pipe(
        Given('a pending serializable atom dehydrated as deferred, restored into a registry made for this request')(
          'ctx',
          () =>
            Effect.sync(() => {
              const latch = Latch.makeUnsafe()
              const counters = { start: 0, stop: 0 }
              const atom = Atom.make(
                Effect.gen(function*() {
                  counters.start += 1
                  yield* latch.await
                  counters.stop += 1
                  return 1
                }),
              ).pipe(
                Atom.serializable({
                  key: 'owned-deferred',
                  schema: Atom.AsyncResult.Schema({ success: Schema.Finite }),
                }),
              )

              const serverRegistry = Atom.Registry.make()
              Atom.Registry.subscribe(serverRegistry, atom, () => {}, { immediate: true })
              const before = { ...counters }
              const dehydratedState = Atom.Hydration.dehydrate(serverRegistry, { encodeInitialAs: 'deferred' })

              function TestComponent() {
                return createElement(
                  'div',
                  null,
                  Atom.AsyncResult.match(AtomReact.useAtomValue(atom), {
                    onInitial: () => 'Initial',
                    onSuccess: () => 'Success',
                    onFailure: () => 'Failure',
                  }),
                )
              }

              const requestRegistry = Atom.Registry.make()
              const applied = Atom.Hydration.hydrate(requestRegistry, dehydratedState)
              const ssrHtml = renderToString(
                createElement(AtomReact.RegistryProvider, { registry: requestRegistry }, createElement(TestComponent)),
              )
              return { applied, atom, before, counters, latch, requestRegistry, ssrHtml }
            }),
        ),
        When('the server-side value settles and the deferred entry completes')(
          'settled',
          (s) =>
            Effect.gen(function*() {
              s.ctx.latch.openUnsafe()
              yield* Fiber.join(s.ctx.applied)
              return Atom.AsyncResult.getOrThrow(Atom.Registry.get(s.ctx.requestRegistry, s.ctx.atom))
            }),
        ),
        Then('the markup showed the pending entry and the request registry now holds the settled value once')((
          s,
          expect,
        ) =>
          expect({ before: s.ctx.before, counters: s.ctx.counters, html: s.ctx.ssrHtml, settled: s.settled })
            .toEqual({
              before: { start: 1, stop: 0 },
              counters: { start: 1, stop: 1 },
              html: '<div>Initial</div>',
              settled: 1,
            })
        ),
      ),
    )
  })
