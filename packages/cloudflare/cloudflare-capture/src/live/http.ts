import { Effect, Option, Redacted } from 'effect'
import type * as HttpBody from 'effect/http/HttpBody'
import * as HttpClient from 'effect/http/HttpClient'
import type * as HttpClientError from 'effect/http/HttpClientError'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import type { CaptureMethod, RawValue } from '../captured-response.schema.js'
import type { HttpExchange } from '../case-catalogue.js'

/** A raw answer from the edge, its JSON still unread. */
export interface RawResponse {
  readonly status: number
  readonly body: Option.Option<RawValue>
}

/** The origin, credential, and exchange one request is built from. */
export interface ExchangeRequest {
  readonly baseUrl: string
  readonly token: Redacted.Redacted<string>
  readonly exchange: HttpExchange
}

const CONSTRUCTORS: Record<CaptureMethod, (url: string) => HttpClientRequest.HttpClientRequest> = {
  GET: HttpClientRequest.get,
  POST: HttpClientRequest.post,
  PUT: HttpClientRequest.put,
  PATCH: HttpClientRequest.patch,
  DELETE: HttpClientRequest.delete,
}

const buildRequest = (
  baseUrl: string,
  exchange: HttpExchange,
): Effect.Effect<HttpClientRequest.HttpClientRequest, HttpBody.HttpBodyError> => {
  const request = CONSTRUCTORS[exchange.method](`${baseUrl}${exchange.path}`)
  return exchange.body === undefined
    ? Effect.succeed(request)
    : HttpClientRequest.bodyJson(request, exchange.body)
}

/**
 * Issues one exchange over the real `HttpClient` and answers with the status and
 * the JSON body. A non-2xx status is a value, not a failure — the capture lane
 * records answers, and an error case's answer is the whole point.
 */
export const send = (
  { baseUrl, token, exchange }: ExchangeRequest,
): Effect.Effect<RawResponse, HttpClientError.HttpClientError | HttpBody.HttpBodyError, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const request = yield* buildRequest(baseUrl, exchange)
    const authorised = HttpClientRequest.setHeader(request, 'authorization', `Bearer ${Redacted.value(token)}`)
    const response = yield* HttpClient.execute(authorised)
    const body = yield* Effect.option(response.json)
    return { status: response.status, body }
  })
