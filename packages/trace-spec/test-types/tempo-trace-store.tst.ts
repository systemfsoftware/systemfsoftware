import type { Graph, Observation } from '@systemfsoftware/trace-spec'
import { TempoTraceStore } from '@systemfsoftware/trace-spec'
import type { Effect } from 'effect'
import type * as HttpClient from 'effect/unstable/http/HttpClient'
import { describe, expect, it } from 'tstyche'

describe('TempoTraceStore.source', () => {
  it('Should_RequireHttpClientAndAnswerTwoFailures_When_SourceReads', () => {
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

  it('Should_AcceptBaseUrlAndRefuseMissing_When_SourceBuilt', () => {
    expect(TempoTraceStore.source).type.toBeCallableWith({ baseUrl: 'http://127.0.0.1:3200' })
    expect(TempoTraceStore.source).type.not.toBeCallableWith({})
  })

  it('Should_KeepHttpClientRequirementAndFailures_When_SourceInspected', () => {
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
