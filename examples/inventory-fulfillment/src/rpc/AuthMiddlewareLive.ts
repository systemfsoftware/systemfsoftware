import { Effect, Layer, Option } from 'effect'
import { Unauthorized } from '../fulfillment/decision.schema.js'
import { AuthContext } from '../ports/AuthContext.service.js'
import { AuthService } from '../ports/AuthService.service.js'
import { AuthMiddleware } from './AuthMiddleware.service.js'

export const layer: Layer.Layer<AuthMiddleware, never, AuthService> = Layer.effect(
  AuthMiddleware,
  Effect.gen(function*() {
    const auth = yield* AuthService
    return (inner, options) =>
      Effect.flatMap(
        auth.resolveSession(new Headers(Object.entries(options.headers))),
        (session) =>
          Option.match(session, {
            onNone: () => Effect.fail(new Unauthorized({ reason: 'no active session' })),
            onSome: (resolved) => Effect.provideService(inner, AuthContext, { userId: resolved.userId }),
          }),
      )
  }),
)
