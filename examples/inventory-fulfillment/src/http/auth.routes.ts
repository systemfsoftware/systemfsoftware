import { Effect, Layer, Result } from 'effect'
import { HttpRouter, HttpServerError, HttpServerRequest, HttpServerResponse } from 'effect/unstable/http'
import { AuthService } from '../ports/AuthService.service.js'

const handler = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  HttpServerError.RequestError,
  AuthService | HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function*() {
    const auth = yield* AuthService
    const webRequest = yield* HttpServerRequest.toWeb(request)
    const outcome = yield* Effect.result(auth.handle(webRequest))
    return Result.match(outcome, {
      onFailure: () => HttpServerResponse.text('authentication backend unavailable', { status: 503 }),
      onSuccess: (response) => HttpServerResponse.fromWeb(response),
    })
  })

export const AuthRoutesLive: Layer.Layer<
  never,
  never,
  | HttpRouter.HttpRouter
  | HttpRouter.Request.From<'Requires', AuthService>
  | HttpRouter.Request.From<
    'Error',
    HttpServerError.RequestError
  >
> = HttpRouter.use((router) => router.add('*', '/api/auth/*', handler))
