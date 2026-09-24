import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
import type { BasicTracerProvider, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base'
import { Handle } from '@systemfsoftware/effect-cell-types'
import { Graph, Observation, ObservationWindow } from '@systemfsoftware/trace-spec'
import { Effect, Layer, pipe } from 'effect'
import type * as Scope from 'effect/Scope'
import { describe, expect, it } from 'tstyche'

interface WindowSpec {
  readonly serviceName: string
}

interface WindowDriver {
  readonly exporter: InMemorySpanExporter
  readonly provider: BasicTracerProvider
}

declare const windowHandle: Handle.Handle<'ObservationWindow', { serviceName: string }>

declare const create: (input: WindowSpec) => Effect.Effect<Handle.Acquired<WindowDriver, WindowSpec>>

describe('Handle.make', () => {
  it('accepts the window integration that builds the tracer from the provider and outputs only the tracer', () => {
    expect(Handle.make).type.toBeCallableWith({
      name: 'ObservationWindow',
      create,
      integration: (driver: WindowDriver, window: WindowSpec) =>
        OtelTracer.layerWithoutOtelTracer.pipe(
          Layer.provideMerge(Layer.succeed(OtelTracer.OtelTracer, driver.provider.getTracer(window.serviceName))),
        ),
    })
  })

  it('refuses the same integration when it leaves the tracer provider in the output', () => {
    expect(Handle.make).type.not.toBeCallableWith({
      name: 'ObservationWindow',
      create,
      integration: (driver: WindowDriver, _window: WindowSpec) =>
        OtelTracer.layerWithoutOtelTracer.pipe(
          Layer.provideMerge(Layer.succeed(OtelTracer.OtelTracerProvider, driver.provider)),
        ),
    })
  })
})

describe('ObservationWindow resource', () => {
  it('binds one window as the observation service plus the tracer and nothing else', () => {
    expect(ObservationWindow.make('trace-spec').layer).type.toBe<
      Layer.Layer<Observation.Observation | OtelTracer.OtelTracer, never, never>
    >()
  })

  it('acquires the window handle in the callers scope', () => {
    expect(ObservationWindow.make('trace-spec').scoped).type.toBe<
      Effect.Effect<Handle.Handle<'ObservationWindow', { serviceName: string }>, never, Scope.Scope>
    >()
  })

  it('collect reads one window data-first and piped', () => {
    expect(ObservationWindow.collect(windowHandle, 'trace-1')).type.toBe<
      Effect.Effect<ReadonlyArray<Graph.SpanRecord>, Observation.EmptyObservationError, never>
    >()
    expect(pipe(windowHandle, ObservationWindow.collect('trace-1'))).type.toBe<
      Effect.Effect<ReadonlyArray<Graph.SpanRecord>, Observation.EmptyObservationError, never>
    >()
  })
})
