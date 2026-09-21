import { Effect, Layer, Option, Schema as S } from 'effect'
import { RpcMiddleware } from 'effect/unstable/rpc'
import { AuthServiceUnavailable, Unauthorized } from '../fulfillment/decision.schema.js'
import { AuthContext } from '../ports/AuthContext.js'
import { AuthService } from '../ports/AuthService.js'

const sessionTimeoutMillis = 5_000

const failureReasonOf = <E = unknown>(thrown: E): string => {
  if (thrown instanceof Error) {
    return thrown.message
  }
  return 'auth backend threw a value that is not an Error'
}

/**
 * Resolves the better-auth session backing every RPC request and exposes the
 * session's `userId` to handlers as `AuthContext`. A genuine missing session
 * (the backend returned no session) fails with the typed `Unauthorized`; a
 * backend that throws or exceeds {@link sessionTimeoutMillis} fails with the
 * typed `AuthServiceUnavailable`, preserving the underlying cause rather than
 * masking an outage as an authentication refusal.
 */
export class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, { provides: AuthContext }>()(
  '@systemfsoftware/example-inventory-fulfillment/rpc/AuthMiddleware',
  { error: S.Union([Unauthorized, AuthServiceUnavailable]) },
) {
  static readonly Live: Layer.Layer<AuthMiddleware, never, AuthService> = Layer.effect(
    this,
    Effect.gen(function*() {
      const auth = yield* AuthService
      return (inner, options) =>
        Effect.tryPromise({
          try: () => auth.api.getSession({ headers: new Headers(Object.entries(options.headers)) }),
          catch: (cause) => new AuthServiceUnavailable({ reason: failureReasonOf(cause) }),
        }).pipe(
          Effect.timeoutOrElse({
            duration: sessionTimeoutMillis,
            orElse: () =>
              Effect.fail(
                new AuthServiceUnavailable({
                  reason: `auth session resolution exceeded ${sessionTimeoutMillis}ms`,
                }),
              ),
          }),
          Effect.flatMap((session) =>
            Option.match(Option.fromNullishOr(session), {
              onNone: () => Effect.fail(new Unauthorized({ reason: 'no active session' })),
              onSome: (resolved) => Effect.provideService(inner, AuthContext, { userId: resolved.user.id }),
            })
          ),
        )
    }),
  )
}
