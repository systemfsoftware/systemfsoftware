import { Effect, Function, Schema } from 'effect'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as Result from 'effect/Result'
import { failureEnvelope } from '../cloudflare-envelope.schema.js'

const badRequest = (): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(failureEnvelope({ code: 1000, message: 'Invalid request body.' }), { status: 400 })

export interface DecodePayloadOptions<S extends Schema.Decoder<Schema.Top['Type']>, R> {
  readonly schema: S
  readonly settle: (body: S['Type']) => Effect.Effect<HttpServerResponse.HttpServerResponse, never, R>
}

const decode = <P, S extends Schema.Decoder<Schema.Top['Type']>, R>(
  payload: P,
  options: DecodePayloadOptions<S, R>,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R> =>
  Result.match(Schema.decodeUnknownResult(options.schema)(payload), {
    onFailure: () => Effect.succeed(badRequest()),
    onSuccess: options.settle,
  })

export const decodePayload: {
  <S extends Schema.Decoder<Schema.Top['Type']>, R>(
    options: DecodePayloadOptions<S, R>,
  ): <P>(payload: P) => Effect.Effect<HttpServerResponse.HttpServerResponse, never, R>
  <P, S extends Schema.Decoder<Schema.Top['Type']>, R>(
    payload: P,
    options: DecodePayloadOptions<S, R>,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R>
} = Function.dual(2, decode)
