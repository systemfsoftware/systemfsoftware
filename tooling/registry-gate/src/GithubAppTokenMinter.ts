import { Clock, Effect, Layer, Match, Redacted, Schema } from 'effect'
import * as Base64Url from 'effect/encoding/Base64Url'
import * as HttpClient from 'effect/http/HttpClient'
import type * as HttpClientError from 'effect/http/HttpClientError'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import { AppTokenMinter } from './app-token-minter.service.js'
import { appJwtClaimsOf, pkcs8DerOf, signingInputOf } from './AppJwt.schema.js'
import { AppCredentials, InstallationTokenResponse, type MintedToken, mintedTokenOf } from './AppToken.schema.js'
import { DopplerOidcToken } from './doppler-oidc.service.js'
import { type MintStage, TokenMintFailed } from './RegistryGateError.schema.js'

const dopplerSecretsUrl = 'https://api.doppler.com/v3/configs/config/secrets/download'
const appSecretNames = ['KIRO_APP_ID', 'KIRO_APP_INSTALLATION_ID', 'KIRO_APP_PRIVATE_KEY']
const rs256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const

// A decode failure's message quotes its input, and these inputs hold the App key and the token.
const failureOf =
  (stage: MintStage) => (error: HttpClientError.HttpClientError | Schema.SchemaError): TokenMintFailed =>
    new TokenMintFailed({
      stage,
      detail: Match.value(error).pipe(
        Match.tag('HttpClientError', (httpError) => httpError.message),
        Match.tag('SchemaError', () => 'the response did not decode'),
        Match.exhaustive,
      ),
    })

const signFailed = (detail: string): TokenMintFailed => new TokenMintFailed({ stage: 'sign', detail })

const readCredentials = (
  client: HttpClient.HttpClient,
  dopplerToken: Redacted.Redacted<string>,
): Effect.Effect<AppCredentials, TokenMintFailed> =>
  client.execute(
    HttpClientRequest.get(dopplerSecretsUrl).pipe(
      HttpClientRequest.bearerToken(dopplerToken),
      HttpClientRequest.setUrlParams({ format: 'json', secrets: appSecretNames.join(',') }),
      HttpClientRequest.acceptJson,
    ),
  ).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(AppCredentials)),
    Effect.mapError(failureOf('doppler')),
  )

const signRs256 = (input: string, pkcs8: Uint8Array<ArrayBuffer>): Effect.Effect<string, TokenMintFailed> =>
  Effect.tryPromise({
    try: async () => {
      const key = await crypto.subtle.importKey('pkcs8', pkcs8, rs256, false, ['sign'])
      const signature = await crypto.subtle.sign(rs256, key, new TextEncoder().encode(input))
      return Base64Url.encode(new Uint8Array(signature))
    },
    catch: () => signFailed('Web Crypto refused the App private key'),
  })

const signAppJwt = (credentials: AppCredentials): Effect.Effect<Redacted.Redacted<string>, TokenMintFailed> =>
  Effect.gen(function*() {
    const pkcs8 = yield* Effect.mapError(
      Effect.fromResult(pkcs8DerOf(Redacted.value(credentials.KIRO_APP_PRIVATE_KEY))),
      signFailed,
    )
    const nowMillis = yield* Clock.currentTimeMillis
    const input = signingInputOf(
      appJwtClaimsOf({ appId: credentials.KIRO_APP_ID, nowSeconds: Math.floor(nowMillis / 1000) }),
    )
    const signature = yield* signRs256(input, pkcs8)
    return Redacted.make(`${input}.${signature}`)
  })

const requestToken = (
  client: HttpClient.HttpClient,
  installationId: string,
  jwt: Redacted.Redacted<string>,
): Effect.Effect<MintedToken, TokenMintFailed> =>
  client.execute(
    HttpClientRequest.post(`https://api.github.com/app/installations/${installationId}/access_tokens`).pipe(
      HttpClientRequest.bearerToken(jwt),
      HttpClientRequest.setHeaders({ accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }),
    ),
  ).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(InstallationTokenResponse)),
    Effect.map(mintedTokenOf),
    Effect.mapError(failureOf('mint')),
  )

const mintWith = (
  client: HttpClient.HttpClient,
  dopplerToken: Redacted.Redacted<string>,
): Effect.Effect<MintedToken, TokenMintFailed> =>
  Effect.gen(function*() {
    const credentials = yield* readCredentials(client, dopplerToken)
    const jwt = yield* signAppJwt(credentials)
    return yield* requestToken(client, credentials.KIRO_APP_INSTALLATION_ID, jwt)
  })

export const layer: Layer.Layer<AppTokenMinter, never, DopplerOidcToken | HttpClient.HttpClient> = Layer.effect(
  AppTokenMinter,
  Effect.gen(function*() {
    const client = yield* HttpClient.HttpClient
    const oidc = yield* DopplerOidcToken
    return AppTokenMinter.of({
      mint: Effect.flatMap(oidc.token, (dopplerToken) => mintWith(client, dopplerToken)),
    })
  }),
)
