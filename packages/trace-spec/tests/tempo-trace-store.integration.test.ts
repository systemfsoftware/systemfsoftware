import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { Graph } from '@systemfsoftware/trace-spec'
import { TempoTraceStore } from '@systemfsoftware/trace-spec'
import { Context, Effect, Layer } from 'effect'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'
import { expect } from 'vitest'
import { Loopback, loopbackStore } from './__fixtures__/loopback-store.fixture.js'
import {
  expectedSpanRecords,
  TEMPO_CHILD_SPAN_ID_WIRE,
  TEMPO_ROOT_SPAN_ID,
  TEMPO_ROOT_SPAN_ID_WIRE,
  TEMPO_TRACE_ID,
  TEMPO_TRACE_ID_WIRE,
  tempoV2TraceBody,
} from './__fixtures__/tempo-v2-trace.fixture.js'

/**
 * A loopback store: a real HTTP server bound to an ephemeral port on
 * 127.0.0.1, freshly bound per scenario and closed when the scenario ends.
 * It answers for each trace id it is taught; the reader reaches it through
 * the published Tempo source over an ordinary fetch client.
 */

type Reply = (request: HttpServerRequest) => HttpServerResponse.HttpServerResponse

const jsonAnswer = (body: string): Reply => () => HttpServerResponse.text(body, { contentType: 'application/json' })

const refusedAnswer = (status: number): Reply => () =>
  HttpServerResponse.text('the store refused this read', { status })

const tenantAnswer: Reply = (request) =>
  request.headers['x-scope-orgid'] === 'tenant-7' ? jsonAnswer(tempoV2TraceBody)(request) : refusedAnswer(404)(request)

// The captured trace again, rebuilt in the store's wire form.
const orderSpanWire =
  `{"traceId":"${TEMPO_TRACE_ID_WIRE}","spanId":"${TEMPO_ROOT_SPAN_ID_WIRE}","name":"PlaceOrder","startTimeUnixNano":"1716235200000000000","endTimeUnixNano":"1716235200150000000"}`

const captureSpanWire =
  `{"traceId":"${TEMPO_TRACE_ID_WIRE}","spanId":"${TEMPO_CHILD_SPAN_ID_WIRE}","parentSpanId":"${TEMPO_ROOT_SPAN_ID_WIRE}","name":"PaymentCapture","startTimeUnixNano":"1716235200250000000","endTimeUnixNano":"1716235200400000000","status":{"code":"STATUS_CODE_ERROR"}}`

const wireAnswer = (status: string, spans: string): string =>
  `{"status":"${status}","trace":{"resourceSpans":[{"scopeSpans":[{"spans":[${spans}]}]}]}}`

const unwireableAnswer =
  '{"trace":{"resourceSpans":[{"scopeSpans":[{"spans":[{"traceId":"S/kvNXezTaajzpKdDg5HNg==","spanId":"not base64!!","name":"Broken","startTimeUnixNano":"1716235200000000000","endTimeUnixNano":"1716235200000000001"}]}]}]}}'

const REPLIES_BY_TRACE: Record<string, Reply> = {
  [TEMPO_TRACE_ID]: jsonAnswer(tempoV2TraceBody),
  'child-before-root': jsonAnswer(wireAnswer('COMPLETE', `${captureSpanWire},${orderSpanWire}`)),
  'marked-unfinished': jsonAnswer(wireAnswer('PARTIAL', `${orderSpanWire},${captureSpanWire}`)),
  'unreadable-answer': jsonAnswer('this is not a trace answer'),
  'traceless-answer': jsonAnswer('{}'),
  'unwireable-span': jsonAnswer(unwireableAnswer),
  'nothing-yet': jsonAnswer('{"trace":{}}'),
  'tenant-gated': tenantAnswer,
  'refused-404': refusedAnswer(404),
  'refused-500': refusedAnswer(500),
}

const traceIdOf = (url: string): string => url.slice(url.lastIndexOf('/') + 1)

const replyFor = (request: HttpServerRequest): HttpServerResponse.HttpServerResponse => {
  const reply = REPLIES_BY_TRACE[traceIdOf(request.url)]
  return (reply ?? refusedAnswer(404))(request)
}

const LoopbackLive = loopbackStore(Effect.succeed(Effect.map(HttpServerRequest, replyFor)))

const givenStoreAnswering = (what: string) =>
  Given(`a store that ${what}`)('baseUrl', () => Effect.map(Loopback, (loopback) => loopback.baseUrl))

const readBack = (baseUrl: string, traceId: string) => TempoTraceStore.source({ baseUrl })(traceId)

const namedSpan = (spans: ReadonlyArray<Graph.SpanRecord>, name: string): Graph.SpanRecord | undefined =>
  spans.find((span) => span.name === name)

const Feature = makeFeature({ it, layer })

Feature('Reading a finished trace back out of a remote trace store')
  .withScenarioLayer(LoopbackLive)
  .liveClock()
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A finished trace comes back as exactly the spans that were pushed',
      Gherkin.Do.pipe(
        givenStoreAnswering('answers for the trace of a pushed order'),
        When('the trace is read back by its id')('spans', (s) => readBack(s.baseUrl, TEMPO_TRACE_ID)),
        Then('the reader sees the order and its payment exactly as they were pushed')((s) => {
          expect(s.spans).toStrictEqual(expectedSpanRecords)
        }),
        And('the payment is attached beneath the order that triggered it')((s) => {
          const order = namedSpan(s.spans, 'PlaceOrder')
          const payment = namedSpan(s.spans, 'PaymentCapture')
          expect(payment?.parentSpanId).toBe(order?.spanId)
          expect(payment?.parentSpanId).toBe(TEMPO_ROOT_SPAN_ID)
        }),
      ),
    )

    scenario(
      'The payment arriving before the order in the store answer keeps them attached',
      Gherkin.Do.pipe(
        givenStoreAnswering('lists the payment before the order'),
        When('the trace is read back by its id')('spans', (s) => readBack(s.baseUrl, 'child-before-root')),
        Then('the payment still points at the order it belongs to')((s) => {
          expect(s.spans.map((span) => span.name)).toStrictEqual(['PaymentCapture', 'PlaceOrder'])
          expect(namedSpan(s.spans, 'PaymentCapture')?.parentSpanId).toBe(TEMPO_ROOT_SPAN_ID)
        }),
      ),
    )

    scenario(
      'An answer the store marked unfinished is not handed to the reader as spans',
      Gherkin.Do.pipe(
        givenStoreAnswering('says its answer for the trace is unfinished'),
        When('the trace is read back by its id')(
          'outcome',
          (s) => Effect.flip(readBack(s.baseUrl, 'marked-unfinished')),
        ),
        Then('the reader is told the answer was unfinished, and how much of it there was')((s) => {
          expect(s.outcome).toMatchObject({ _tag: 'IncompleteObservationError', spanCount: 2 })
        }),
      ),
    )

    scenario(
      'A store that has stopped answering is reported as unreachable',
      Gherkin.Do.pipe(
        Given('a store endpoint that answered before and has since gone away')('gone', () =>
          Effect.scoped(
            Effect.map(Layer.build(LoopbackLive), (loopback) => Context.get(loopback, Loopback).baseUrl),
          )),
        When('the trace is read back from that endpoint')(
          'outcome',
          (s) => Effect.flip(readBack(s.gone, TEMPO_TRACE_ID)),
        ),
        Then('the reader is told the store could not be reached, at the address it was asked at')((s) => {
          expect(s.outcome).toMatchObject({
            _tag: 'TransportObservationError',
            source: `${s.gone}/api/v2/traces/${TEMPO_TRACE_ID}`,
          })
        }),
      ),
    )

    scenarioOutline(
      'A store refusing the read with <status> is reported as unreachable, not as an empty store',
      [{ trace: 'refused-404', status: 404 }, { trace: 'refused-500', status: 500 }] as const,
      (row) =>
        Gherkin.Do.pipe(
          givenStoreAnswering(`refuses the read with ${row.status}`),
          When('the trace is read back by its id')('outcome', (s) => Effect.flip(readBack(s.baseUrl, row.trace))),
          Then('the reader is told the read was refused, naming the refusal')((s) => {
            expect(s.outcome._tag).toBe('TransportObservationError')
            expect(s.outcome.detail).toContain(String(row.status))
          }),
        ),
    )

    scenario(
      'An answer that is not a trace answer at all is a refused read',
      Gherkin.Do.pipe(
        givenStoreAnswering('answers with something that is not a trace answer'),
        When('the trace is read back by its id')(
          'outcome',
          (s) => Effect.flip(readBack(s.baseUrl, 'unreadable-answer')),
        ),
        Then('the reader is told the answer could not be understood')((s) => {
          expect(s.outcome._tag).toBe('TransportObservationError')
          expect(s.outcome.detail).toContain('undecodable trace body')
        }),
      ),
    )

    scenario(
      'A store answer without any trace in it is a refused read',
      Gherkin.Do.pipe(
        givenStoreAnswering('answers without any trace in it'),
        When('the trace is read back by its id')(
          'outcome',
          (s) => Effect.flip(readBack(s.baseUrl, 'traceless-answer')),
        ),
        Then('the reader is told the answer could not be understood, not told the trace was empty')((s) => {
          expect(s.outcome._tag).toBe('TransportObservationError')
          expect(s.outcome.detail).toContain('undecodable trace body')
        }),
      ),
    )

    scenario(
      'A span the wire cannot carry makes the whole answer unreadable',
      Gherkin.Do.pipe(
        givenStoreAnswering('carries a span id the wire cannot carry'),
        When('the trace is read back by its id')('outcome', (s) => Effect.flip(readBack(s.baseUrl, 'unwireable-span'))),
        Then('the reader is told the answer could not be understood')((s) => {
          expect(s.outcome._tag).toBe('TransportObservationError')
          expect(s.outcome.detail).toContain('undecodable trace body')
        }),
      ),
    )

    scenario(
      'A trace the store knows but holds no spans for reads back as nothing yet',
      Gherkin.Do.pipe(
        givenStoreAnswering('knows the trace but holds no spans for it'),
        When('the trace is read back by its id')('spans', (s) => readBack(s.baseUrl, 'nothing-yet')),
        Then('the reader is given an empty answer rather than a refusal')((s) => {
          expect(s.spans).toStrictEqual([])
        }),
      ),
    )

    scenario(
      'A reader that marks its requests for its tenant is answered',
      Gherkin.Do.pipe(
        givenStoreAnswering('answers only for the tenant it knows'),
        When('the trace is read back with every request marked for that tenant')(
          'spans',
          (s) =>
            Effect.gen(function*() {
              const client = yield* HttpClient.HttpClient
              const tenant = HttpClient.mapRequest(
                client,
                (request) => HttpClientRequest.setHeader(request, 'X-Scope-OrgID', 'tenant-7'),
              )
              return yield* readBack(s.baseUrl, 'tenant-gated').pipe(
                Effect.provideService(HttpClient.HttpClient, tenant),
              )
            }),
        ),
        Then('the store answers the tenant reader with the pushed spans')((s) => {
          expect(s.spans).toStrictEqual(expectedSpanRecords)
        }),
      ),
    )
  })
