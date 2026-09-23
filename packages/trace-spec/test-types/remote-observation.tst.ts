import { Graph, Observation, RemoteObservation } from '@systemfsoftware/trace-spec'
import { Context, Effect, type Layer, pipe, Schema as S } from 'effect'
import { describe, expect, it } from 'tstyche'

class Guest extends Context.Service<Guest, { readonly handshake: Effect.Effect<string> }>()('test/Guest') {}

class Outage extends S.TaggedError<Outage>()('Outage', {
  detail: S.String,
}) {}

declare const guestSource: RemoteObservation.TraceSource<Guest>
declare const strangerSource: (traceId: string) => Effect.Effect<ReadonlyArray<Graph.SpanRecord>, Outage>
declare const options: RemoteObservation.Options

describe('RemoteObservation.layer', () => {
  it('stands over a trace source, provides the observation service alone, and requires exactly what the source requires', () => {
    expect(RemoteObservation.layer).type.toBeCallableWith(guestSource, options)
    expect(RemoteObservation.layer(guestSource, options)).type.toBe<
      Layer.Layer<Observation.Observation, never, Guest>
    >()
  })

  it('composes data-last in a pipe to the same layer', () => {
    expect(pipe(guestSource, RemoteObservation.layer(options))).type.toBe<
      Layer.Layer<Observation.Observation, never, Guest>
    >()
    expect(RemoteObservation.layer(options)).type.toBeCallableWith(guestSource)
    expect(RemoteObservation.layer(options)).type.not.toBeCallableWith(strangerSource)
  })

  it('refuses a source whose failures are not observation failures', () => {
    expect(RemoteObservation.layer).type.not.toBeCallableWith(strangerSource, options)
  })
})
