import { NodeHttpServer } from '@effect/platform-node'
import { Context, Effect, Layer, Result } from 'effect'
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient'
import * as HttpServer from 'effect/unstable/http/HttpServer'
import type { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest'
import type * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'
import * as NetAddress from 'effect/unstable/net/NetAddress'

export class Loopback extends Context.Service<Loopback, { readonly baseUrl: string }>()(
  '@systemfsoftware/trace-spec/tests/__fixtures__/loopback-store.fixture/Loopback',
) {}

type Answering<R> = Effect.Effect<
  Effect.Effect<HttpServerResponse.HttpServerResponse, never, HttpServerRequest>,
  never,
  R
>

const baseUrlOf = (address: NetAddress.InetAddress): string => {
  const url = Result.getOrThrow(NetAddress.toUrl(address))
  if (NetAddress.isUnspecified(address.address)) {
    url.hostname = NetAddress.formatIp(NetAddress.ipv4Loopback)
  }
  return url.origin
}

const listening = <R>(answering: Answering<R>) =>
  Layer.effect(
    Loopback,
    Effect.gen(function*() {
      const server = yield* HttpServer.HttpServer
      yield* server.serve(yield* answering)
      if (NetAddress.isUnixPathAddress(server.address)) {
        return yield* Effect.die(new Error('the loopback store listened on a unix socket'))
      }
      return { baseUrl: baseUrlOf(server.address) }
    }),
  )

const serverReachedByFetch = Layer.mergeAll(NodeHttpServer.layerTest, FetchHttpClient.layer)

export const loopbackStore = <R>(answering: Answering<R>) =>
  Layer.orDie(Layer.provideMerge(listening(answering), serverReachedByFetch))
