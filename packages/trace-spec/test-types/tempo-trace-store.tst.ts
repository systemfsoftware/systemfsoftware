import type { Graph, Observation } from '@systemfsoftware/trace-spec'
import { TempoTraceStore } from '@systemfsoftware/trace-spec'
import type { Effect } from 'effect'
import type * as HttpClient from 'effect/unstable/http/HttpClient'
import { describe, expect, it } from 'tstyche'

describe('TempoTraceStore.source', () => {
  it('one read needs exactly the caller’s http client and answers with the two store failures', () => {
    expect(TempoTraceStore.source({ baseUrl: 'http://127.0.0.1:3200' })).type.toBe<
      (
        traceId: string,
      ) => Effect.Effect<
        ReadonlyArray<Graph.SpanRecord>,
        Observation.IncompleteObservationError | Observation.TransportObservationError,
        HttpClient.HttpClient
      >
    >()
  })

  it('takes a base url and refuses to be built without one', () => {
    expect(TempoTraceStore.source).type.toBeCallableWith({ baseUrl: 'http://127.0.0.1:3200' })
    expect(TempoTraceStore.source).type.not.toBeCallableWith({})
  })

  it('does not erase the http client requirement or the store failures', () => {
    const source = TempoTraceStore.source({ baseUrl: 'http://127.0.0.1:3200' })
    expect(source).type.not.toBeAssignableTo<
      (
        traceId: string,
      ) => Effect.Effect<
        ReadonlyArray<Graph.SpanRecord>,
        Observation.IncompleteObservationError | Observation.TransportObservationError
      >
    >()
    expect(source).type.not.toBeAssignableTo<
      (traceId: string) => Effect.Effect<ReadonlyArray<Graph.SpanRecord>, never, HttpClient.HttpClient>
    >()
  })
})
