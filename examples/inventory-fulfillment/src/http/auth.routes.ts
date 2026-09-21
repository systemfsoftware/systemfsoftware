import { type Auth, betterAuth, type BetterAuthOptions } from 'better-auth'
import { type DB, drizzleAdapter } from 'better-auth/adapters/drizzle'
import { Context, Effect, Layer } from 'effect'
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/unstable/http'
import { account, session, user, verification } from '../store/schema.tables.js'

export class AuthService extends Context.Service<AuthService, Auth>()(
  '@systemfsoftware/example-inventory-fulfillment/http/AuthService',
) {}

const options = (database: DB, secret: string): BetterAuthOptions => ({
  database: drizzleAdapter(database, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true },
  secret,
})

export const makeAuth = (database: DB, secret: string): Auth => betterAuth(options(database, secret))

const handler = (
  auth: Auth,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, HttpServerRequest.HttpServerRequest> =>
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const webRequest = yield* HttpServerRequest.toWeb(request)
    const response = yield* Effect.promise(() => auth.handler(webRequest))
    return HttpServerResponse.fromWeb(response)
  }).pipe(Effect.orDie)

export const layer: Layer.Layer<never, never, HttpRouter.HttpRouter | AuthService> = HttpRouter.use((router) =>
  Effect.gen(function*() {
    const auth = yield* AuthService
    yield* router.add('*', '/api/auth/*', handler(auth))
  })
)
