import { NodeCrypto, NodeHttpServer } from '@effect/platform-node'
import { Context, Effect, Layer, Ref, Result, Schema } from 'effect'
import * as Crypto from 'effect/Crypto'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpServer from 'effect/unstable/http/HttpServer'
import type * as HttpServerError from 'effect/unstable/http/HttpServerError'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'
import * as NetAddress from 'effect/unstable/net/NetAddress'

export interface LoopbackReply {
  readonly status: number
  readonly body: Schema.Json
}

export interface RecordedRequest {
  readonly url: string
  readonly text: string
  readonly body: Schema.Json
}

export interface OpenRouterLoopbackShape {
  readonly apiUrl: string
  readonly requests: Effect.Effect<ReadonlyArray<RecordedRequest>>
  readonly requestCount: Effect.Effect<number>
  readonly answerWith: (replies: ReadonlyArray<LoopbackReply>) => Effect.Effect<void>
}

export class OpenRouterLoopback extends Context.Service<OpenRouterLoopback, OpenRouterLoopbackShape>()(
  '@systemfsoftware/pack-eval/tests/__fixtures__/openrouter-loopback.fixture/OpenRouterLoopback',
) {}

const decodeJson = Schema.decodeEffect(Schema.fromJsonString(Schema.Json))

const replyAt = (replies: ReadonlyArray<LoopbackReply>, index: number): LoopbackReply => {
  const last = replies.length - 1
  return replies[index <= last ? index : last] ?? { status: 500, body: { error: 'the loopback script has no replies' } }
}

const answering = (
  script: Ref.Ref<ReadonlyArray<LoopbackReply>>,
  requests: Ref.Ref<ReadonlyArray<RecordedRequest>>,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  HttpServerError.HttpServerError | Schema.SchemaError,
  HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const text = yield* request.text
    const body = yield* decodeJson(text)
    const index = yield* Ref.modify(requests, (all) => [
      all.length,
      [...all, { url: request.url, text, body }],
    ])
    const reply = yield* Effect.map(Ref.get(script), (replies) => replyAt(replies, index))
    return HttpServerResponse.setStatus(HttpServerResponse.jsonUnsafe(reply.body), reply.status)
  })

const baseUrlOf = (address: NetAddress.InetAddress): string => {
  const url = Result.getOrThrow(NetAddress.toUrl(address))
  if (NetAddress.isUnspecified(address.address)) {
    url.hostname = NetAddress.formatIp(NetAddress.ipv4Loopback)
  }
  return url.origin
}

const serving = Layer.effect(
  OpenRouterLoopback,
  Effect.gen(function*() {
    const server = yield* HttpServer.HttpServer
    const script = yield* Ref.make<ReadonlyArray<LoopbackReply>>([])
    const requests = yield* Ref.make<ReadonlyArray<RecordedRequest>>([])
    yield* server.serve(answering(script, requests))
    if (NetAddress.isUnixPathAddress(server.address)) {
      return yield* Effect.die(new Error('the loopback provider listened on a unix socket'))
    }
    return {
      apiUrl: `${baseUrlOf(server.address)}/api/v1`,
      requests: Ref.get(requests),
      requestCount: Effect.map(Ref.get(requests), (all) => all.length),
      answerWith: (replies: ReadonlyArray<LoopbackReply>) => Ref.set(script, replies),
    }
  }),
)

export const openRouterLoopback: Layer.Layer<
  OpenRouterLoopback | Crypto.Crypto | FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
> = Layer.orDie(Layer.provideMerge(serving, Layer.mergeAll(NodeHttpServer.layerTest, NodeCrypto.layer)))
