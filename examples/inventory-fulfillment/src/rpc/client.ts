import { Effect, Option, type Scope } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'
import { RpcClient, RpcClientError, RpcGroup, RpcSerialization } from 'effect/unstable/rpc'
import { FulfillmentRpcs } from './inventory-fulfillment.rpc.js'

export type Client = RpcClient.RpcClient<RpcGroup.Rpcs<typeof FulfillmentRpcs>, RpcClientError.RpcClientError>

export interface ClientOptions {
  readonly baseUrl: string
  readonly cookie?: string | undefined
}

const protocolOf = (options: ClientOptions) =>
  Effect.gen(function*() {
    const base = yield* HttpClient.HttpClient
    const withUrl = base.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(`${options.baseUrl}/rpc`)))
    const withCookie = Option.match(Option.fromUndefinedOr(options.cookie), {
      onNone: () => withUrl,
      onSome: (cookie) => withUrl.pipe(HttpClient.mapRequest(HttpClientRequest.setHeader('cookie', cookie))),
    })
    return yield* RpcClient.makeProtocolHttp(withCookie)
  })

export const make = (
  options: ClientOptions,
): Effect.Effect<Client, never, HttpClient.HttpClient | Scope.Scope | RpcSerialization.RpcSerialization> =>
  Effect.gen(function*() {
    const protocol = yield* protocolOf(options)
    return yield* RpcClient.make(FulfillmentRpcs).pipe(Effect.provideService(RpcClient.Protocol, protocol))
  })
