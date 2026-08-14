/**
 * Server-side rendering tests for the React atom hooks.
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
import * as Effect from 'effect/Effect'
import * as Latch from 'effect/Latch'
import * as Schema from 'effect/Schema'
import { renderToString } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { HydrationBoundary, RegistryContext, useAtomValue } from '../src/index.js'

it('Should_RunAtomsDuringSsr_When_NoServerSnapshotGiven', () => {
  const getCount = vi.fn(() => 0)
  const counterAtom = Atom.make(getCount)

  function TestComponent() {
    const count = useAtomValue(counterAtom)
    return <div>{count}</div>
  }

  const ssrHtml = renderToString(
    <RegistryContext.Provider value={AtomRegistry.make()}>
      <TestComponent />
    </RegistryContext.Provider>,
  )

  expect(getCount).toHaveBeenCalled()
  expect(ssrHtml).toContain('0')
})

it('Should_SkipAtomEffectsDuringSsr_When_UsingWithServerSnapshot', () => {
  const mockFetchData = vi.fn(() => 0)
  const userDataAtom = Atom.make(Effect.sync(() => mockFetchData())).pipe(Atom.withServerValueInitial)
  const registry = AtomRegistry.make()

  function TestComponent() {
    const result = useAtomValue(userDataAtom)

    return (
      <div>
        {AsyncResult.match(result, {
          onInitial: () => 'Initial',
          onSuccess: () => 'Success',
          onFailure: () => 'Failure',
        })}
      </div>
    )
  }

  const ssrHtml = renderToString(
    <RegistryContext.Provider value={registry}>
      <TestComponent />
    </RegistryContext.Provider>,
  )

  expect(mockFetchData).not.toHaveBeenCalled()
  expect(ssrHtml).toContain('Initial')

  // On the client the atom is read through the registry (mount path), which
  // runs the effect instead of the server snapshot.
  const clientValue = registry.get(userDataAtom)
  expect(mockFetchData).toHaveBeenCalled()
  expect(AsyncResult.isSuccess(clientValue)).toBe(true)
})

it('Should_HydrateFromServerSnapshot_When_DehydratedStateProvided', () => {
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
  const atomResult3 = makeAtomResult('pending', Effect.never as Effect.Effect<number, string>)

  // Simulate the server: run the atoms in a source registry and dehydrate the
  // serializable state it ends up with.
  const serverRegistry = AtomRegistry.make()
  serverRegistry.set(atomBasic, 1)
  serverRegistry.mount(atomResult1)
  serverRegistry.mount(atomResult2)
  serverRegistry.mount(atomResult3)
  const dehydratedState = Hydration.dehydrate(serverRegistry, { encodeInitialAs: 'value-only' })

  function Basic() {
    const value = useAtomValue(atomBasic)
    return <div data-testid='value'>{value}</div>
  }

  function Result1() {
    const value = useAtomValue(atomResult1)
    return AsyncResult.match(value, {
      onSuccess: (success) => <div data-testid='value-1'>{success.value}</div>,
      onFailure: () => <div data-testid='error-1'>Error</div>,
      onInitial: () => <div data-testid='loading-1'>Loading...</div>,
    })
  }

  function Result2() {
    const value = useAtomValue(atomResult2)
    return AsyncResult.match(value, {
      onSuccess: (success) => <div data-testid='value-2'>{success.value}</div>,
      onFailure: () => <div data-testid='error-2'>Error</div>,
      onInitial: () => <div data-testid='loading-2'>Loading...</div>,
    })
  }

  function Result3() {
    const value = useAtomValue(atomResult3)
    return AsyncResult.match(value, {
      onSuccess: (success) => <div data-testid='value-3'>{success.value}</div>,
      onFailure: () => <div data-testid='error-3'>Error</div>,
      onInitial: () => <div data-testid='loading-3'>Loading...</div>,
    })
  }

  const ssrHtml = renderToString(
    <RegistryContext.Provider value={AtomRegistry.make()}>
      <HydrationBoundary state={dehydratedState}>
        <Basic />
        <Result1 />
        <Result2 />
        <Result3 />
      </HydrationBoundary>
    </RegistryContext.Provider>,
  )

  expect(ssrHtml).toContain('data-testid="value">1<')
  expect(ssrHtml).toContain('data-testid="value-1">123<')
  expect(ssrHtml).toContain('data-testid="error-2">Error<')
  expect(ssrHtml).toContain('data-testid="loading-3">Loading...<')
})

it('Should_HydrateFromStreamingServerSnapshot_When_EncodedAsPromise', async () => {
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

  expect(start).toBe(1)
  expect(stop).toBe(0)

  const dehydratedState = Hydration.dehydrate(serverRegistry, {
    encodeInitialAs: 'deferred',
  })

  function TestComponent() {
    const value = useAtomValue(atom)
    return (
      <div>
        {AsyncResult.match(value, {
          onInitial: () => 'Initial',
          onSuccess: () => 'Success',
          onFailure: () => 'Failure',
        })}
      </div>
    )
  }

  const hydrationRegistry = AtomRegistry.make()
  const ssrHtml = renderToString(
    // provide a fresh registry each time to simulate hydration
    <RegistryContext.Provider value={hydrationRegistry}>
      <HydrationBoundary state={dehydratedState}>
        <TestComponent />
      </HydrationBoundary>
    </RegistryContext.Provider>,
  )

  expect(ssrHtml).toContain('Initial')
  expect(start).toBe(1)
  expect(stop).toBe(0)

  Effect.runSync(latch.open)
  await Effect.runPromise(latch.await)

  // The streaming hydration fiber applies the settled value to the hydration
  // registry once the server-side atom leaves its Initial state.
  await vi.waitFor(() => {
    const snapshot = hydrationRegistry.get(atom)
    expect(AsyncResult.isSuccess(snapshot)).toBe(true)
  })

  expect(AsyncResult.getOrThrow(hydrationRegistry.get(atom))).toBe(1)
  expect(start).toBe(1)
  expect(stop).toBe(1)
})
