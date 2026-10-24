import { Config, Effect, Layer, Match, Redacted, Schema } from 'effect'
import * as HttpClient from 'effect/http/HttpClient'
import type * as HttpClientError from 'effect/http/HttpClientError'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import { DopplerOidcToken } from './doppler-oidc.service.js'
import { ActionsOidcTokenResponse, DopplerOidcTokenResponse } from './DopplerOidc.schema.js'
import { TokenMintFailed } from './RegistryGateError.schema.js'

const dopplerOidcUrl = 'https://api.doppler.com/v3/auth/oidc'
const defaultAudience = 'https://github.com/systemfsoftware'

const oidcFailed = (error: HttpClientError.HttpClientError | Schema.SchemaError): TokenMintFailed =>
  new TokenMintFailed({
    stage: 'oidc',
    detail: Match.value(error).pipe(
      Match.tag('HttpClientError', (httpError) => httpError.message),
      Match.tag('SchemaError', () => 'the response did not decode'),
      Match.exhaustive,
    ),
  })

const noOidcToken = new TokenMintFailed({
  stage: 'oidc',
  detail: 'GitHub issued no OIDC token value; the job needs `permissions: id-token: write`',
})

const requestActionsOidcToken = (
  client: HttpClient.HttpClient,
  requestUrl: string,
  audience: string,
  bearer: Redacted.Redacted<string>,
): Effect.Effect<Redacted.Redacted<string>, TokenMintFailed> =>
  Effect.flatMap(
    Effect.sync(() => {
      const url = new URL(requestUrl)
      url.searchParams.set('audience', audience)
      return HttpClientRequest.get(url).pipe(
        HttpClientRequest.bearerToken(bearer),
        HttpClientRequest.setHeaders({ accept: 'application/json; api-version=2.0' }),
      )
    }),
    (request) =>
      client.execute(request).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(ActionsOidcTokenResponse)),
        Effect.mapError(oidcFailed),
        Effect.flatMap((response) =>
          Match.value(response.value).pipe(
            Match.when(undefined, () => Effect.fail(noOidcToken)),
            Match.orElse((token) => Effect.succeed(token)),
          )
        ),
      ),
  )

const exchangeForDopplerToken = (
  client: HttpClient.HttpClient,
  identityId: string,
  oidcToken: Redacted.Redacted<string>,
): Effect.Effect<Redacted.Redacted<string>, TokenMintFailed> =>
  client.execute(
    HttpClientRequest.post(dopplerOidcUrl).pipe(
      HttpClientRequest.bodyJsonUnsafe({ identity: identityId, token: Redacted.value(oidcToken) }),
    ),
  ).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(DopplerOidcTokenResponse)),
    Effect.mapError(oidcFailed),
    Effect.map((response) => response.token),
  )

export const layer: Layer.Layer<DopplerOidcToken, Config.ConfigError, HttpClient.HttpClient> = Layer.effect(
  DopplerOidcToken,
  Effect.gen(function*() {
    const client = yield* HttpClient.HttpClient
    const identityId = yield* Config.NonEmptyString('DOPPLER_IDENTITY_ID')
    const requestUrl = yield* Config.NonEmptyString('ACTIONS_ID_TOKEN_REQUEST_URL')
    const bearer = yield* Config.schema(Schema.Redacted(Schema.NonEmptyString), 'ACTIONS_ID_TOKEN_REQUEST_TOKEN')
    const audience = yield* Config.withDefault(Config.NonEmptyString('DOPPLER_OIDC_AUDIENCE'), defaultAudience)
    return DopplerOidcToken.of({
      token: Effect.flatMap(
        requestActionsOidcToken(client, requestUrl, audience, bearer),
        (oidcToken) => exchangeForDopplerToken(client, identityId, oidcToken),
      ),
    })
  }),
)
