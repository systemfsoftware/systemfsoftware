import { Clock, Context, Effect, Layer, Schema } from 'effect'
import { type CryptoKey, exportJWK, generateKeyPair, type JWTPayload, SignJWT, UnsecuredJWT } from 'jose'
import { createServer, type Server } from 'node:http'

const LOOPBACK = '127.0.0.1'
const KID = 'published-key'

export const AUDIENCE = 'https://contract.test/accounts'
export const ISSUER = 'https://contract.test/authorization-server'
export const SUBJECT = 'user-42'
export const VALID_SCOPE_CLAIM = 'read:balance write'

export interface SignOverrides {
  readonly audience?: string
  readonly issuer?: string
  readonly expiresInSeconds?: number
  readonly subject?: string
  readonly scope?: string
}

export interface JwksFixture {
  readonly uri: string
  readonly sign: (overrides: SignOverrides) => Effect.Effect<string>
  readonly signWithUnpublishedKey: (overrides: SignOverrides) => Effect.Effect<string>
  readonly signUnsecured: (overrides: SignOverrides) => Effect.Effect<string>
  readonly signHs256WithPublishedKey: (overrides: SignOverrides) => Effect.Effect<string>
}

export class JwksServer extends Context.Service<JwksServer, JwksFixture>()(
  '@systemfsoftware/effect-contract/tests/JwksServer',
) {}

const JsonString = Schema.fromJsonString(Schema.Unknown)

const encodeJson = (value: object): Effect.Effect<string> => Effect.orDie(Schema.encodeUnknownEffect(JsonString)(value))

const claimsOf = (overrides: SignOverrides): JWTPayload => ({
  sub: overrides.subject ?? SUBJECT,
  scope: overrides.scope ?? VALID_SCOPE_CLAIM,
})

const expiryOf = (nowSeconds: number, overrides: SignOverrides): number =>
  nowSeconds + (overrides.expiresInSeconds ?? 3600)

const signWith = (key: CryptoKey, overrides: SignOverrides, nowSeconds: number): Promise<string> =>
  new SignJWT(claimsOf(overrides))
    .setProtectedHeader({ alg: 'ES256', kid: KID })
    .setIssuedAt(nowSeconds)
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUDIENCE)
    .setExpirationTime(expiryOf(nowSeconds, overrides))
    .sign(key)

const unsecuredWith = (overrides: SignOverrides, nowSeconds: number): string =>
  new UnsecuredJWT(claimsOf(overrides))
    .setIssuedAt(nowSeconds)
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUDIENCE)
    .setExpirationTime(expiryOf(nowSeconds, overrides))
    .encode()

const hs256With = (secret: Uint8Array, overrides: SignOverrides, nowSeconds: number): Promise<string> =>
  new SignJWT(claimsOf(overrides))
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(nowSeconds)
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUDIENCE)
    .setExpirationTime(expiryOf(nowSeconds, overrides))
    .sign(secret)

const nowSeconds: Effect.Effect<number> = Effect.map(Clock.currentTimeMillis, (millis) => Math.floor(millis / 1000))

/** A loopback URI whose port is bound and released, so a fetch to it is refused. */
export const closedPortUri: Effect.Effect<string> = Effect.callback((resume) => {
  const probe = createServer()
  probe.on('error', (cause) => resume(Effect.die(cause)))
  probe.listen(0, LOOPBACK, () => {
    const address = probe.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    probe.close(() => resume(Effect.succeed(`http://${LOOPBACK}:${port}/.well-known/jwks.json`)))
  })
})

export const JwksServerLive: Layer.Layer<JwksServer> = Layer.effect(
  JwksServer,
  Effect.gen(function*() {
    const published = yield* Effect.promise(() => generateKeyPair('ES256', { extractable: true }))
    const unpublished = yield* Effect.promise(() => generateKeyPair('ES256', { extractable: true }))
    const publicJwk = yield* Effect.promise(() => exportJWK(published.publicKey))
    const document = yield* encodeJson({ keys: [{ ...publicJwk, kid: KID, alg: 'ES256', use: 'sig' }] })
    const secret = new TextEncoder().encode(yield* encodeJson(publicJwk))
    const started = yield* Effect.acquireRelease(
      Effect.callback<{ readonly server: Server; readonly uri: string }>((resume) => {
        const server = createServer((_request, response) => {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(document)
        })
        server.listen(0, LOOPBACK, () => {
          const address = server.address()
          const port = typeof address === 'object' && address !== null ? address.port : 0
          resume(Effect.succeed({ server, uri: `http://${LOOPBACK}:${port}/.well-known/jwks.json` }))
        })
      }),
      ({ server }) =>
        Effect.sync(() => {
          server.close()
        }),
    )
    const fixture: JwksFixture = {
      uri: started.uri,
      sign: (overrides) =>
        nowSeconds.pipe(Effect.flatMap((now) => Effect.promise(() => signWith(published.privateKey, overrides, now)))),
      signWithUnpublishedKey: (overrides) =>
        nowSeconds.pipe(
          Effect.flatMap((now) => Effect.promise(() => signWith(unpublished.privateKey, overrides, now))),
        ),
      signUnsecured: (overrides) => nowSeconds.pipe(Effect.map((now) => unsecuredWith(overrides, now))),
      signHs256WithPublishedKey: (overrides) =>
        nowSeconds.pipe(Effect.flatMap((now) => Effect.promise(() => hs256With(secret, overrides, now)))),
    }
    return fixture
  }),
)
