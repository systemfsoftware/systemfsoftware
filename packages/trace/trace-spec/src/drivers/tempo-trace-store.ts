import { Effect, Match, Result, Schema } from 'effect'
import * as HttpClient from 'effect/http/HttpClient'
import type { HttpClientError } from 'effect/http/HttpClientError'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import { IncompleteObservationError } from '../IncompleteObservationError.schema.js'
import type { TraceSource } from '../RemoteObservation.js'
import type { SpanRecord } from '../TraceGraph.schema.js'
import { TransportObservationError } from '../TransportObservationError.schema.js'
import {
  JudgeTempoAnswer,
  judgeTempoAnswer,
  type TempoBody,
  TempoBodyDecoded,
  TempoBodyUndecodable,
} from './judge-tempo-answer.workflow.js'
import { HexId, TempoV2TraceResponse } from './tempo-trace.schema.js'

/**
 * The Grafana Tempo trace source: one read of one trace by id against one
 * store endpoint. It never polls, waits, or retries — completeness belongs
 * to the remote observation layer. Any refusal (unreachable endpoint,
 * non-2xx answer, undecodable body) fails with the transport failure whose
 * `source` is the request URL; an answer the store marked incomplete fails
 * with the incomplete failure, since waiting cannot complete it.
 */

const parseBody = Schema.decodeResult(Schema.fromJsonString(TempoV2TraceResponse))

const orEmpty = <T>(values: ReadonlyArray<T> | undefined): ReadonlyArray<T> => values ?? []

const spansOf = (response: TempoV2TraceResponse): ReadonlyArray<SpanRecord> =>
  orEmpty(response.trace.resourceSpans).flatMap((resourceSpans) =>
    orEmpty(resourceSpans.scopeSpans).flatMap((scopeSpans) => orEmpty(scopeSpans.spans))
  )

const bodyOf = (decoded: Result.Result<TempoV2TraceResponse, Schema.SchemaError>): TempoBody =>
  Result.match(decoded, {
    onFailure: (error) => new TempoBodyUndecodable({ detail: error.message }),
    onSuccess: (response) => new TempoBodyDecoded({ spans: spansOf(response), status: response.status }),
  })

const transportFailureOf = (traceId: string, url: string, cause: string): TransportObservationError =>
  new TransportObservationError({ traceId, source: url, detail: cause })

const refusedOf = (traceId: string, url: string, error: HttpClientError): TransportObservationError =>
  transportFailureOf(traceId, url, error.message)

const undecodableOf = (traceId: string, url: string, detail: string): TransportObservationError =>
  transportFailureOf(traceId, url, `undecodable trace body: ${detail}`)

const incompleteOf = (traceId: string, status: string, spanCount: number): IncompleteObservationError =>
  new IncompleteObservationError({
    traceId,
    spanCount,
    detail: `the store answered ${status}: waiting cannot complete the trace`,
  })

const readTrace = (
  traceId: string,
  url: string,
  body: string,
): Effect.Effect<ReadonlyArray<SpanRecord>, IncompleteObservationError | TransportObservationError> =>
  Effect.flatMap(
    Effect.fromResult(judgeTempoAnswer(new JudgeTempoAnswer({ body: bodyOf(parseBody(body)) }))),
    (decision) =>
      Match.value(decision).pipe(
        Match.tag('TempoAnswerComplete', (complete) => Effect.succeed(complete.spans)),
        Match.tag(
          'TempoAnswerIncomplete',
          (incomplete) => Effect.fail(incompleteOf(traceId, incomplete.status, incomplete.spanCount)),
        ),
        Match.tag(
          'TempoAnswerUndecodable',
          (undecodable) => Effect.fail(undecodableOf(traceId, url, undecodable.detail)),
        ),
        Match.exhaustive,
      ),
  )

/** One read against one Tempo endpoint. Its only requirement is the caller's HTTP client. */
export const source = (options: { readonly baseUrl: string }): TraceSource<HttpClient.HttpClient> => {
  const urlOf = (traceId: string): string => `${options.baseUrl}/api/v2/traces/${traceId}`
  return (traceId) => {
    const url = urlOf(traceId)
    return HttpClient.execute(HttpClientRequest.get(url).pipe(HttpClientRequest.acceptJson)).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((response) => response.text),
      Effect.mapError((error) => refusedOf(traceId, url, error)),
      Effect.flatMap((body) => readTrace(traceId, url, body)),
    )
  }
}

const decodeId = Schema.decodeEffect(HexId)
const encodeId = Schema.encodeEffect(HexId)

const hexOf = (value: bigint, chars: number): string => BigInt.asUintN(chars, value).toString(16).padStart(chars, '0')

if (import.meta.vitest !== void 0) {
  // Dynamic import: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@systemfsoftware/vitest')

  const HexIdCodec = { encode: encodeId, decode: decodeId }
  it.effect.prop(
    '∀id_HexId_∘Base64RoundTrip',
    { of: [Schema.BigInt, Schema.BigInt], subject: HexIdCodec },
    (codec, [spanIdValue, traceIdValue]) =>
      Effect.gen(function*() {
        const spanId = hexOf(spanIdValue, 16)
        const traceId = hexOf(traceIdValue, 32)
        return (yield* codec.decode(yield* codec.encode(spanId))) === spanId &&
          (yield* codec.decode(yield* codec.encode(traceId))) === traceId
      }),
  )
}
