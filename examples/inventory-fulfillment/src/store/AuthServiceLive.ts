import { type Auth, betterAuth, type BetterAuthOptions } from 'better-auth'
import { type DB, drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Duration, Effect, Layer, Option } from 'effect'
import { dual } from 'effect/Function'
import { AuthServiceUnavailable } from '../fulfillment/decision.schema.js'
import { AuthService, type AuthServiceService, type AuthSession } from '../ports/AuthService.service.js'
import { PgRuntime } from './PgRuntime.js'
import { account, session, user, verification } from './schema.tables.js'

const options = (database: DB, secret: string): BetterAuthOptions => ({
  database: drizzleAdapter(database, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true },
  secret,
})

const authTimeout = Duration.millis(5_000)

const authTimedOut = (): AuthServiceUnavailable =>
  new AuthServiceUnavailable({ cause: new Error('auth request exceeded 5000ms') })

const fromAuth = (auth: Auth): AuthServiceService => ({
  resolveSession: (headers) =>
    Effect.tryPromise({
      try: () => auth.api.getSession({ headers }),
      catch: (cause) => new AuthServiceUnavailable({ cause }),
    }).pipe(
      Effect.timeoutOrElse({
        duration: authTimeout,
        orElse: () => Effect.fail(authTimedOut()),
      }),
      Effect.map((resolved) =>
        Option.map(Option.fromNullishOr(resolved), (found) => ({ userId: found.user.id } satisfies AuthSession))
      ),
    ),
  handle: (request) =>
    Effect.tryPromise({
      try: () => auth.handler(request),
      catch: (cause) => new AuthServiceUnavailable({ cause }),
    }).pipe(
      Effect.timeoutOrElse({
        duration: authTimeout,
        orElse: () => Effect.fail(authTimedOut()),
      }),
    ),
})

export const makeAuth: {
  (secret: string): (database: DB) => Auth
  (database: DB, secret: string): Auth
} = dual(2, (database: DB, secret: string): Auth => betterAuth(options(database, secret)))

export const makeAuthService: {
  (secret: string): (database: DB) => AuthServiceService
  (database: DB, secret: string): AuthServiceService
} = dual(2, (database: DB, secret: string): AuthServiceService => fromAuth(makeAuth(database, secret)))

export const layer: Layer.Layer<AuthService, never, PgRuntime> = Layer.effect(
  AuthService,
  Effect.gen(function*() {
    const runtime = yield* PgRuntime
    return makeAuthService(drizzle({ client: runtime.pool }), runtime.betterAuthSecret)
  }),
)
