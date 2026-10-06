import { Effect, type Scope } from 'effect'
import { dual } from 'effect/Function'
import { HttpClient, HttpClientRequest } from 'effect/http'
import { RpcClient, RpcSerialization } from 'effect/rpc'
import type { RpcClientError } from 'effect/rpc'
import { type Capabilities, type ContractRpc, groupOf } from './group.js'

export interface ClientOptions {
  readonly url: string
}

export type ClientEffect = Effect.Effect<
  RpcClient.RpcClient<ContractRpc, RpcClientError.RpcClientError>,
  never,
  HttpClient.HttpClient | Scope.Scope
>

interface Client {
  <R>(registry: Capabilities<R>, options: ClientOptions): ClientEffect
  <R>(options: ClientOptions): (registry: Capabilities<R>) => ClientEffect
}

const clientImpl = <R>(registry: Capabilities<R>, options: ClientOptions): ClientEffect =>
  Effect.gen(function*() {
    const httpClient = yield* HttpClient.HttpClient
    const protocol = yield* RpcClient.makeProtocolHttp(
      HttpClient.mapRequest(httpClient, HttpClientRequest.prependUrl(options.url)),
    ).pipe(Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.json))
    return yield* RpcClient.make(groupOf(registry)).pipe(
      Effect.provideService(RpcClient.Protocol, protocol),
    )
  })

export const client: Client = dual(2, clientImpl)
