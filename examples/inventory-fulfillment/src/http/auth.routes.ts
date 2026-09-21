import type { Auth } from 'better-auth'
import { Effect, Layer } from 'effect'
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/unstable/http'
import { AuthService } from '../ports/AuthService.js'

const handler = (
  auth: Auth,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, HttpServerRequest.HttpServerRequest> =>
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const webRequest = yield* HttpServerRequest.toWeb(request)
    const response = yield* Effect.promise(() => auth.handler(webRequest))
    return HttpServerResponse.fromWeb(response)
  }).pipe(Effect.orDie)

export const AuthRoutesLive: Layer.Layer<never, never, HttpRouter.HttpRouter | AuthService> = HttpRouter.use((router) =>
  Effect.gen(function*() {
    const auth = yield* AuthService
    yield* router.add('*', '/api/auth/*', handler(auth))
  })
)
