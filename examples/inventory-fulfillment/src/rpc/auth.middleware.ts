import { Effect, Layer, Option } from 'effect'
import { RpcMiddleware } from 'effect/unstable/rpc'
import { Unauthorized } from '../domain/decision.schema.js'
import { AuthService } from '../http/auth.routes.js'
import { AuthContext } from '../ports/AuthContext.js'

/**
 * Resolves the better-auth session backing every RPC request and exposes the
 * session's `userId` to handlers as `AuthContext`, or fails the request with the
 * typed `Unauthorized` schema error when no session exists.
 */
export class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, { provides: AuthContext }>()(
  '@systemfsoftware/example-inventory-fulfillment/rpc/AuthMiddleware',
  { error: Unauthorized },
) {}

const webHeaders = (headers: Readonly<Record<string, string>>): Headers => new Headers(Object.entries(headers))

export const layer: Layer.Layer<AuthMiddleware, never, AuthService> = Layer.effect(
  AuthMiddleware,
  Effect.gen(function*() {
    const auth = yield* AuthService
    return (inner, options) =>
      Effect.tryPromise({
        try: () => auth.api.getSession({ headers: webHeaders(options.headers) }),
        catch: () => new Unauthorized({ reason: 'session resolution failed' }),
      }).pipe(
        Effect.flatMap((session) =>
          Option.match(Option.fromNullishOr(session), {
            onNone: () => Effect.fail(new Unauthorized({ reason: 'no active session' })),
            onSome: (resolved) => Effect.provideService(inner, AuthContext, { userId: resolved.user.id }),
          })
        ),
      )
  }),
)
