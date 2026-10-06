import { Contract } from '@systemfsoftware/effect-contract'
import { type Capabilities, type ContractRpc, type Invocation } from '@systemfsoftware/effect-contract/rpc'
import type { SurfaceClient } from '@systemfsoftware/effect-contract/testing'
import { Effect, Option, Schema } from 'effect'
import { dual } from 'effect/Function'
import type { RpcClient, RpcClientError } from 'effect/rpc'
import type { Scope } from 'effect/Scope'

export const anonymous = new Contract.Anonymous({})

const asJson = <A>(value: A): Schema.Json =>
  Option.getOrThrowWith(
    Schema.decodeUnknownOption(Schema.Json)(value),
    () => new Error('a capability census encoded outside Schema.Json'),
  )

const encodeCensus = (contract: Contract.Any, answer: Contract.Answer): Effect.Effect<Schema.Json> =>
  Effect.map(Effect.orDie(Schema.encodeEffect(Schema.toCodecJson(contract.answer))(answer)), asJson)

type RpcFailure = Contract.Refused | Contract.Rejected | Contract.Unavailable | RpcClientError.RpcClientError

const missing = (what: string): Effect.Effect<never> => Effect.die(new Error(what))

const failureOf = (contract: Contract.Any, error: RpcFailure): Effect.Effect<Schema.Json, Contract.Unavailable> =>
  Schema.is(Contract.Unavailable)(error)
    ? Effect.fail(error)
    : Schema.is(Contract.Refused)(error) || Schema.is(Contract.Rejected)(error)
    ? encodeCensus(contract, error)
    : Effect.die(error)

const rpcCensusImpl = (
  contract: Contract.Any,
  call: Effect.Effect<Contract.Answer, RpcFailure>,
): Effect.Effect<Schema.Json, Contract.Unavailable> =>
  Effect.matchEffect(call, {
    onSuccess: (answer) => encodeCensus(contract, answer),
    onFailure: (error) => failureOf(contract, error),
  })

interface RpcCensus {
  (contract: Contract.Any, call: Effect.Effect<Contract.Answer, RpcFailure>): Effect.Effect<
    Schema.Json,
    Contract.Unavailable
  >
  (call: Effect.Effect<Contract.Answer, RpcFailure>): (contract: Contract.Any) => Effect.Effect<
    Schema.Json,
    Contract.Unavailable
  >
}

export const rpcCensus: RpcCensus = dual(2, rpcCensusImpl)

export const rpcCall = (options: {
  readonly rpc: RpcClient.RpcClient<ContractRpc, RpcClientError.RpcClientError>
  readonly name: string
  readonly invocation: Invocation
}): Effect.Effect<Contract.Answer, RpcFailure> =>
  Effect.gen(function*() {
    const method = yield* Option.match(Option.fromUndefinedOr(options.rpc[options.name]), {
      onNone: () => missing(`the RPC client has no method named ${options.name}`),
      onSome: (found) => Effect.succeed(found),
    })
    return yield* method(options.invocation)
  })

export const surfaceOf = <R, A>(config: {
  readonly registry: Capabilities<R>
  readonly build: (
    registry: Capabilities<R>,
  ) => Effect.Effect<RpcClient.RpcClient<ContractRpc, RpcClientError.RpcClientError>, never, A | Scope>
}): SurfaceClient<A> => ({
  call: (name, invocation) =>
    Effect.scoped(
      Effect.gen(function*() {
        const capability = yield* Option.match(Option.fromUndefinedOr(config.registry[name]), {
          onNone: () => missing(`no capability named ${name}`),
          onSome: Effect.succeed,
        })
        const rpc = yield* config.build(config.registry)
        return yield* rpcCensus(capability.contract, rpcCall({ rpc, name, invocation }))
      }),
    ),
})
