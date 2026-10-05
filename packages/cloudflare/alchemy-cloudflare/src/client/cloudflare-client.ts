/**
 * The one credential seam every Cloudflare call goes through (KTD3): the
 * generated client reads distilled's `Credentials` per request, so a
 * `Credentials` layer with an emulator `apiBaseUrl` redirects the resources
 * and Alchemy's own Cloudflare resources together. Non-2xx responses classify
 * into `./errors.ts`; a 429 retries twice honoring `Retry-After` before it
 * fails `RateLimited`.
 */
import { Credentials, formatHeaders } from '@distilled.cloud/cloudflare/Credentials'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as HttpApiClient from 'effect/http-api/HttpApiClient'
import * as HttpClient from 'effect/http/HttpClient'
import type * as HttpClientError from 'effect/http/HttpClientError'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import type * as HttpClientResponse from 'effect/http/HttpClientResponse'
import * as Layer from 'effect/Layer'
import { CloudflareApi } from '../api/index.js'
import { classifyResponse, CloudflareApiError, type CloudflareError } from './errors.js'

const attachCredentials = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function*() {
    const resolve = yield* Credentials
    const credentials = yield* resolve
    return HttpClientRequest.setHeaders(
      HttpClientRequest.prependUrl(credentials.apiBaseUrl)(request),
      formatHeaders(credentials),
    )
  })

const MAX_RATE_LIMIT_RETRIES = 2

const retryRateLimited = <A, R>(
  effect: Effect.Effect<A, CloudflareError, R>,
): Effect.Effect<A, CloudflareError, R> => {
  const attempt: (remaining: number) => Effect.Effect<A, CloudflareError, R> = (remaining) =>
    Effect.catchTag(
      effect,
      'RateLimited',
      (error) => remaining === 0 ? Effect.fail(error) : Effect.delay(attempt(remaining - 1), error.retryAfter),
    )
  return Effect.suspend(() => attempt(MAX_RATE_LIMIT_RETRIES))
}

const toCloudflareError = <A, R>(
  effect: Effect.Effect<A, HttpClientError.HttpClientError | CloudflareError, R>,
): Effect.Effect<A, CloudflareError, R> =>
  Effect.catchTag(
    effect,
    'HttpClientError',
    (error) => Effect.fail(new CloudflareApiError({ status: 0, code: 0, message: error.message })),
  )

const classifyAndRetry = (
  effect: Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>,
) =>
  effect.pipe(
    Effect.filterOrElse(
      (response) => response.status < 400,
      (response) => classifyResponse(response),
    ),
    toCloudflareError,
    retryRateLimited,
  )

const transformClient = (client: HttpClient.HttpClient) =>
  client.pipe(
    HttpClient.transformResponse(classifyAndRetry),
    HttpClient.mapRequestEffect(attachCredentials),
  )

const buildClient = Effect.flatMap(
  HttpClient.HttpClient,
  (httpClient) => HttpApiClient.makeWith(CloudflareApi, { httpClient: transformClient(httpClient) }),
)

export class CloudflareClient extends Context.Service<
  CloudflareClient,
  Effect.Success<typeof buildClient>
>()('@systemfsoftware/alchemy-cloudflare/CloudflareClient') {}

export const layer: Layer.Layer<CloudflareClient, never, HttpClient.HttpClient> = Layer.effect(
  CloudflareClient,
  buildClient,
)
