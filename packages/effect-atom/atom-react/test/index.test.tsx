import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as Registry from '@systemfsoftware/effect-atom/Registry'
import { act, render, screen, waitFor } from '@testing-library/react'
import { Effect, Layer, Schema } from 'effect'
import { Suspense } from 'react'
import { renderToString } from 'react-dom/server'
import { ErrorBoundary } from 'react-error-boundary'
import { beforeEach, describe, expect, it, test, vi } from 'vitest'
import { Hydration, RegistryContext, RegistryProvider, Result, useAtomSuspense, useAtomValue } from '../src/index.js'
import { HydrationBoundary } from '../src/ReactHydration.js'

describe('atom-react', () => {
  let registry: Registry.Registry

  beforeEach(() => {
    registry = Registry.make()
  })

  describe('runtime', () => {
    test('Should_InjectTestLayers_When_ConstructingRuntime', () => {
      class TheNumber extends Effect.Service<TheNumber>()('TheNumber', {
        succeed: { n: 42 },
      }) {}
      const runtime = Atom.runtime(TheNumber.Default)
      const numberAtom = runtime.atom(TheNumber.use((_) => Effect.succeed(_.n)))

      function TestComponent() {
        const value = useAtomValue(numberAtom, Result.getOrThrow)
        return <div data-testid='value'>{value}</div>
      }

      render(
        <RegistryProvider
          initialValues={[
            Atom.initialValue(
              runtime.layer,
              Layer.succeed(TheNumber, new TheNumber({ n: 69 })),
            ),
          ]}
        >
          <TestComponent />
        </RegistryProvider>,
      )

      expect(screen.getByTestId('value')).toHaveTextContent('69')
    })
  })

  describe('useAtomValue', () => {
    test('Should_ReadValueFromSimpleAtom_When_AtomHoldsValue', () => {
      const atom = Atom.make(42)

      function TestComponent() {
        const value = useAtomValue(atom)
        return <div data-testid='value'>{value}</div>
      }

      render(<TestComponent />)

      expect(screen.getByTestId('value')).toHaveTextContent('42')
    })

    test('Should_ReadValueWithTransformFunction_When_TransformApplied', () => {
      const atom = Atom.make(42)

      function TestComponent() {
        const value = useAtomValue(atom, (x) => x * 2)
        return <div data-testid='value'>{value}</div>
      }

      render(<TestComponent />)

      expect(screen.getByTestId('value')).toHaveTextContent('84')
    })

    test('Should_Update_When_AtomValueChanges', async () => {
      const atom = Atom.make('initial')

      function TestComponent() {
        const value = useAtomValue(atom)
        return <div data-testid='value'>{value}</div>
      }

      render(
        <RegistryContext.Provider value={registry}>
          <TestComponent />
        </RegistryContext.Provider>,
      )

      expect(screen.getByTestId('value')).toHaveTextContent('initial')

      act(() => {
        registry.set(atom, 'updated')
      })

      await waitFor(() => {
        expect(screen.getByTestId('value')).toHaveTextContent('updated')
      })
    })

    test('Should_ReadValueFromComputedAtom_When_DerivedFromBaseAtom', () => {
      const baseAtom = Atom.make(10)
      const computedAtom = Atom.make((get) => get(baseAtom) * 2)

      function TestComponent() {
        const value = useAtomValue(computedAtom)
        return <div data-testid='value'>{value}</div>
      }

      render(<TestComponent />)

      expect(screen.getByTestId('value')).toHaveTextContent('20')
    })

    test('Should_ResolveSuspense_When_AtomSucceeds', () => {
      const atom = Atom.make(Effect.never)

      function TestComponent() {
        const value = useAtomSuspense(atom).value
        return <div data-testid='value'>{value}</div>
      }

      render(
        <Suspense fallback={<div data-testid='loading'>Loading...</div>}>
          <TestComponent />
        </Suspense>,
      )

      expect(screen.getByTestId('loading')).toBeInTheDocument()
    })
  })

  test('Should_SurfaceError_When_SuspendedAtomFails', () => {
    const atom = Atom.make(Effect.fail(new Error('test')))
    function TestComponent() {
      const value = useAtomSuspense(atom).value
      return <div data-testid='value'>{value}</div>
    }

    render(
      <ErrorBoundary fallback={<div data-testid='error'>Error</div>}>
        <Suspense fallback={<div data-testid='loading'>Loading...</div>}>
          <TestComponent />
        </Suspense>
      </ErrorBoundary>,
      {
        onCaughtError: (error: unknown) => {
          if (error instanceof Error && error.message === 'test') {
            return
          }
          // eslint-disable-next-line no-console
          console.error(error)
        },
      },
    )

    expect(screen.getByTestId('error')).toBeInTheDocument()
  })

  test('Should_HydrateFromServerSnapshot_When_DehydratedStateProvided', () => {
    const atomBasic = Atom.make(0).pipe(
      Atom.serializable({
        key: 'basic',
        schema: Schema.Number,
      }),
    )
    const e: Effect.Effect<number, string> = Effect.never
    const makeAtomResult = (key: string) =>
      Atom.make(e).pipe(
        Atom.serializable({
          key,
          schema: Result.Schema({
            success: Schema.Number,
            error: Schema.String,
          }),
        }),
      )

    const atomResult1 = makeAtomResult('success')
    const atomResult2 = makeAtomResult('errored')
    const atomResult3 = makeAtomResult('pending')

    const dehydratedState: Array<Hydration.DehydratedAtomValue> = [
      {
        '~@systemfsoftware/effect-atom/DehydratedAtom': true,
        key: 'basic',
        value: 1,
        dehydratedAt: Date.now(),
      },
      {
        '~@systemfsoftware/effect-atom/DehydratedAtom': true,
        key: 'success',
        value: {
          _tag: 'Success',
          value: 123,
          waiting: false,
          timestamp: Date.now(),
        },
        dehydratedAt: Date.now(),
      },
      {
        '~@systemfsoftware/effect-atom/DehydratedAtom': true,
        key: 'errored',
        value: {
          _tag: 'Failure',
          cause: {
            _tag: 'Fail',
            error: 'error',
          },
          previousSuccess: {
            _tag: 'None',
          },
          waiting: false,
        },
        dehydratedAt: Date.now(),
      },
      {
        '~@systemfsoftware/effect-atom/DehydratedAtom': true,
        key: 'pending',
        value: {
          _tag: 'Initial',
          waiting: true,
        },
        dehydratedAt: Date.now(),
      },
    ]

    function Basic() {
      const value = useAtomValue(atomBasic)
      return <div data-testid='value'>{value}</div>
    }

    function Result1() {
      const value = useAtomValue(atomResult1)
      return Result.match(value, {
        onSuccess: (success) => <div data-testid='value-1'>{success.value}</div>,
        onFailure: () => <div data-testid='error-1'>Error</div>,
        onInitial: () => <div data-testid='loading-1'>Loading...</div>,
      })
    }

    function Result2() {
      const value = useAtomValue(atomResult2)
      return Result.match(value, {
        onSuccess: (success) => <div data-testid='value-2'>{success.value}</div>,
        onFailure: () => <div data-testid='error-2'>Error</div>,
        onInitial: () => <div data-testid='loading-2'>Loading...</div>,
      })
    }

    function Result3() {
      const value = useAtomValue(atomResult3)
      return Result.match(value, {
        onSuccess: (success) => <div data-testid='value-3'>{success.value}</div>,
        onFailure: () => <div data-testid='error-3'>Error</div>,
        onInitial: () => <div data-testid='loading-3'>Loading...</div>,
      })
    }

    render(
      <HydrationBoundary state={dehydratedState}>
        <Basic />
        <Result1 />
        <Result2 />
        <Result3 />
      </HydrationBoundary>,
    )

    expect(screen.getByTestId('value')).toHaveTextContent('1')
    expect(screen.getByTestId('value-1')).toHaveTextContent('123')
    expect(screen.getByTestId('error-2')).toBeInTheDocument()
    expect(screen.getByTestId('loading-3')).toBeInTheDocument()
  })

  test('Should_HydrateFromStreamingServerSnapshot_When_EncodedAsPromise', async () => {
    const latch = Effect.runSync(Effect.makeLatch())
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
        schema: Result.Schema({
          success: Schema.Number,
        }),
      }),
    )

    registry.mount(atom)

    expect(start).toBe(1)
    expect(stop).toBe(0)

    const dehydratedState = Hydration.dehydrate(registry, {
      encodeInitialAs: 'promise',
    })

    function TestComponent() {
      const value = useAtomValue(atom)
      return (
        <div data-testid='value'>
          {Result.match(value, { onInitial: () => 'Initial', onSuccess: () => 'Success', onFailure: () => 'Failure' })}
        </div>
      )
    }

    const hydrationRegistry = Registry.make()
    render(
      // provide a fresh registry each time to simulate hydration
      <RegistryContext.Provider value={hydrationRegistry}>
        <HydrationBoundary state={dehydratedState}>
          <TestComponent />
        </HydrationBoundary>
      </RegistryContext.Provider>,
    )

    expect(screen.getByTestId('value')).toHaveTextContent('Initial')

    act(() => {
      Effect.runSync(latch.open)
    })
    await Effect.runPromise(latch.await)

    const snapshot = registry.get(atom)
    expect(Result.isSuccess(snapshot)).toBe(true)
    if (Result.isSuccess(snapshot)) {
      expect(snapshot.value).toBe(1)
    }

    expect(screen.getByTestId('value')).toHaveTextContent('Success')
    expect(start).toBe(1)
    expect(stop).toBe(1)
  })

  describe('SSR', () => {
    it('Should_RunAtomsDuringSsr_When_NoServerSnapshotGiven', () => {
      const getCount = vi.fn(() => 0)
      const counterAtom = Atom.make(getCount)

      function TestComponent() {
        const count = useAtomValue(counterAtom)
        return <div>{count}</div>
      }

      const ssrHtml = renderToString(<TestComponent />)

      expect(getCount).toHaveBeenCalled()
      expect(ssrHtml).toContain('0')

      render(<TestComponent />)

      expect(getCount).toHaveBeenCalled()
      expect(screen.getByText('0')).toBeInTheDocument()
    })
  })

  it('Should_SkipAtomEffectsDuringSsr_When_UsingWithServerSnapshot', () => {
    const mockFetchData = vi.fn(() => 0)

    const userDataAtom = Atom.make(Effect.sync(() => mockFetchData())).pipe(
      Atom.withServerValueInitial,
    )

    function TestComponent() {
      const result = useAtomValue(userDataAtom)

      return (
        <div>
          {Result.match(result, { onInitial: () => 'Initial', onSuccess: () => 'Success', onFailure: () => 'Failure' })}
        </div>
      )
    }

    const ssrHtml = renderToString(<TestComponent />)

    expect(mockFetchData).not.toHaveBeenCalled()
    expect(ssrHtml).toContain('Initial')

    render(<TestComponent />)

    expect(mockFetchData).toHaveBeenCalled()
    expect(screen.getByText('Success')).toBeInTheDocument()
  })
})
