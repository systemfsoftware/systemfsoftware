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
  it('Should_ProvideObservationAloneAndRequireSourceNeeds_When_LayerBuiltOverTraceSource', () => {
    expect(RemoteObservation.layer).type.toBeCallableWith(guestSource, options)
    expect(RemoteObservation.layer(guestSource, options)).type.toBe<
      Layer.Layer<Observation.Observation, never, Guest>
    >()
  })

  it('Should_ComposeInPipeToSameLayer_When_LayerIsDataLast', () => {
    expect(pipe(guestSource, RemoteObservation.layer(options))).type.toBe<
      Layer.Layer<Observation.Observation, never, Guest>
    >()
    expect(RemoteObservation.layer(options)).type.toBeCallableWith(guestSource)
    expect(RemoteObservation.layer(options)).type.not.toBeCallableWith(strangerSource)
  })

  it('Should_RefuseSource_When_FailuresAreNotObservationFailures', () => {
    expect(RemoteObservation.layer).type.not.toBeCallableWith(strangerSource, options)
  })
})
